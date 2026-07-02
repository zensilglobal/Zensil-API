"""Amazon orders → orders + order_items via SP-API Orders API.
Also auto-populates sku_master from line items (SellerSKU/ASIN/Title) so the
foreign key holds even before a full catalog sync. Access token minted fresh.
PRD §7.1 / four-step pattern."""
from __future__ import annotations

import datetime as dt
import os
import time

import httpx
import psycopg

from etl.auth import amazon_spapi
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "amazon_orders"
LOOKBACK_DAYS = int(os.getenv("AMAZON_ORDERS_LOOKBACK_DAYS", "45"))


def enabled() -> bool:
    return settings.has_spapi()


def _get(client: httpx.Client, path: str, headers: dict, params: dict | None = None) -> dict:
    """GET with basic 429 back-off (SP-API is rate-limited)."""
    for attempt in range(6):
        r = client.get(path, headers=headers, params=params)
        if r.status_code == 429:
            time.sleep(2 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()
    return {}


def fetch() -> tuple[list[dict], list[dict], list[dict]]:
    """Pull orders + line items from SP-API. Holds NO DB connection (the fetch
    can take minutes; keeping a warehouse connection open idle would drop it)."""
    headers = amazon_spapi.auth_headers()
    base = amazon_spapi.api_base()
    created_after = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=LOOKBACK_DAYS)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )

    order_rows: list[dict] = []
    item_rows: list[dict] = []
    sku_rows: dict[str, dict] = {}

    with httpx.Client(base_url=base, timeout=60) as client:
        params: dict = {"MarketplaceIds": settings.amazon_marketplace_id, "CreatedAfter": created_after}
        orders: list[dict] = []
        while True:
            payload = _get(client, "/orders/v0/orders", headers, params).get("payload", {})
            orders.extend(payload.get("Orders", []))
            token = payload.get("NextToken")
            if not token:
                break
            params = {"NextToken": token}
            time.sleep(1)  # getOrders rate limit

        for o in orders:
            oid = o["AmazonOrderId"]
            order_rows.append({
                "channel": "amazon",
                "order_id": oid,
                "order_date": o.get("PurchaseDate"),
                "status": (o.get("OrderStatus") or "").lower() or None,
                "buyer_region": (o.get("ShippingAddress") or {}).get("StateOrRegion"),
                "total_value": float((o.get("OrderTotal") or {}).get("Amount", 0) or 0),
            })

            # line items (separate rate-limited call per order)
            items = _get(client, f"/orders/v0/orders/{oid}/orderItems", headers).get("payload", {}).get("OrderItems", [])
            for i, li in enumerate(items, start=1):
                sku = li.get("SellerSKU") or li.get("ASIN") or f"UNKNOWN-{oid}-{i}"
                qty = int(li.get("QuantityOrdered", 0) or 0)
                line_total = float((li.get("ItemPrice") or {}).get("Amount", 0) or 0)
                sku_rows.setdefault(sku, {
                    "internal_sku": sku,
                    "product_name": (li.get("Title") or sku)[:300],
                    "amazon_asin": li.get("ASIN"),
                    "amazon_sku": li.get("SellerSKU"),
                    "cost_price": 0,
                })
                if qty <= 0:
                    continue
                item_rows.append({
                    "channel": "amazon",
                    "order_id": oid,
                    "line_no": i,
                    "internal_sku": sku,
                    "qty": qty,
                    "unit_price": round(line_total / qty, 2) if qty else line_total,
                })
            time.sleep(0.5)  # getOrderItems rate limit

    return list(sku_rows.values()), order_rows, item_rows


def persist(conn: psycopg.Connection, data: tuple[list[dict], list[dict], list[dict]]) -> int:
    sku_rows, order_rows, item_rows = data
    # sku_master first (FK target), then orders, then items.
    upsert(conn, "sku_master", sku_rows, conflict_keys=["internal_sku"],
           update_cols=["product_name", "amazon_asin", "amazon_sku"])
    upsert(conn, "orders", order_rows, conflict_keys=["channel", "order_id"])
    upsert(conn, "order_items", item_rows, conflict_keys=["channel", "order_id", "line_no"])
    return len(order_rows)


def run(conn: psycopg.Connection) -> int:
    # Note: run_all opens the connection before calling run(); for very large
    # backfills prefer fetch() then persist() so no idle connection is held.
    return persist(conn, fetch())
