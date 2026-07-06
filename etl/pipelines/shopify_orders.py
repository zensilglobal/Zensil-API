"""Shopify orders → orders + order_items. Uses the GraphQL Admin API with
cursor pagination. PRD four-step pattern (auth → pull → transform → upsert)."""
from __future__ import annotations

import httpx
import psycopg

from etl.auth import shopify
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "shopify_orders"

QUERY = """
query Orders($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: PROCESSED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name
      processedAt
      displayFulfillmentStatus
      shippingAddress { provinceCode }
      currentTotalPriceSet { shopMoney { amount } }
      lineItems(first: 20) {
        nodes { sku quantity originalUnitPriceSet { shopMoney { amount } } }
      }
    }
  }
}
"""


def enabled() -> bool:
    return settings.has_shopify()


def fetch() -> tuple[list[dict], list[dict]]:
    """Pull + transform all pages. Holds NO DB conn (Neon drops idle sessions)."""
    headers = shopify.auth_headers()
    url = shopify.graphql_url()
    cursor: str | None = None
    order_rows: list[dict] = []
    item_rows: list[dict] = []

    with httpx.Client(timeout=60) as client:
        while True:
            resp = client.post(url, headers=headers, json={"query": QUERY, "variables": {"cursor": cursor}})
            resp.raise_for_status()
            data = resp.json()["data"]["orders"]
            for o in data["nodes"]:
                oid = o["name"]
                order_rows.append({
                    "channel": "shopify",
                    "order_id": oid,
                    "order_date": o["processedAt"],
                    "status": (o.get("displayFulfillmentStatus") or "").lower() or None,
                    "buyer_region": (o.get("shippingAddress") or {}).get("provinceCode"),
                    "total_value": float(o["currentTotalPriceSet"]["shopMoney"]["amount"]),
                })
                for i, li in enumerate(o["lineItems"]["nodes"], start=1):
                    item_rows.append({
                        "channel": "shopify",
                        "order_id": oid,
                        "line_no": i,
                        "internal_sku": li.get("sku"),  # SKU must match sku_master.shopify_sku/internal_sku
                        "qty": li["quantity"],
                        "unit_price": float(li["originalUnitPriceSet"]["shopMoney"]["amount"]),
                    })
            if not data["pageInfo"]["hasNextPage"]:
                break
            cursor = data["pageInfo"]["endCursor"]
    return order_rows, item_rows


def persist(conn: psycopg.Connection, data: tuple[list[dict], list[dict]]) -> int:
    order_rows, item_rows = data
    upsert(conn, "orders", order_rows, conflict_keys=["channel", "order_id"])
    upsert(conn, "order_items", item_rows, conflict_keys=["channel", "order_id", "line_no"])
    return len(order_rows)


def run(conn: psycopg.Connection) -> int:
    return persist(conn, fetch())
