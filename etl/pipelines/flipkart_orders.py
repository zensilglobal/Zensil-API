"""Flipkart orders → orders + order_items. Uses the shipments search API,
paginated. Bearer token auto-refreshes via etl.auth.flipkart."""
from __future__ import annotations

import httpx
import psycopg

from etl.auth import flipkart
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "flipkart_orders"


def enabled() -> bool:
    return settings.has_flipkart()


def fetch() -> tuple[list[dict], list[dict]]:
    """Pull + transform. Holds NO DB conn (Neon drops idle sessions)."""
    headers = flipkart.auth_headers()
    order_rows: list[dict] = []
    item_rows: list[dict] = []

    with httpx.Client(base_url=flipkart.API_BASE, timeout=60) as client:
        # Pull: POST /v3/shipments/filter then page via nextPageUrl.
        # See PRD Appendix B. Incremental: filter on orderDate >= last watermark.
        resp = client.post("/v3/shipments/filter", headers=headers, json={
            "filter": {"states": ["APPROVED", "PACKED", "SHIPPED", "DELIVERED"]},
            "pagination": {"pageSize": 20},
        })
        resp.raise_for_status()
        payload = resp.json()

        # Transform: map Flipkart shipments → unified schema, stamp channel.
        for sh in payload.get("shipments", []):
            oid = sh["orderId"]
            order_rows.append({
                "channel": "flipkart",
                "order_id": oid,
                "order_date": sh.get("orderDate"),
                "status": sh.get("status"),
                "buyer_region": sh.get("deliveryAddress", {}).get("state"),
                "total_value": sh.get("totalPrice"),
            })
            for i, li in enumerate(sh.get("orderItems", []), start=1):
                item_rows.append({
                    "channel": "flipkart",
                    "order_id": oid,
                    "line_no": i,
                    "internal_sku": li.get("sku"),  # map Flipkart SKU → internal_sku via sku_master
                    "qty": li.get("quantity", 1),
                    "unit_price": li.get("sellingPrice"),
                })
        # TODO: follow payload["nextPageUrl"] until exhausted.
    return order_rows, item_rows


def persist(conn: psycopg.Connection, data: tuple[list[dict], list[dict]]) -> int:
    order_rows, item_rows = data
    upsert(conn, "orders", order_rows, conflict_keys=["channel", "order_id"])
    upsert(conn, "order_items", item_rows, conflict_keys=["channel", "order_id", "line_no"])
    return len(order_rows)


def run(conn: psycopg.Connection) -> int:
    return persist(conn, fetch())
