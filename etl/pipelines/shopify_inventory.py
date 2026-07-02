"""Shopify inventory → daily snapshot row per SKU (never overwrite)."""
from __future__ import annotations

import datetime as dt

import httpx
import psycopg

from etl.auth import shopify
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "shopify_inventory"

QUERY = """
query Variants($cursor: String) {
  productVariants(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { sku inventoryQuantity }
  }
}
"""


def enabled() -> bool:
    return settings.has_shopify()


def run(conn: psycopg.Connection) -> int:
    headers = shopify.auth_headers()
    url = shopify.graphql_url()
    today = dt.date.today().isoformat()
    cursor: str | None = None
    rows: list[dict] = []

    with httpx.Client(timeout=60) as client:
        while True:
            resp = client.post(url, headers=headers, json={"query": QUERY, "variables": {"cursor": cursor}})
            resp.raise_for_status()
            data = resp.json()["data"]["productVariants"]
            for v in data["nodes"]:
                if not v.get("sku"):
                    continue
                rows.append({
                    "channel": "shopify",
                    "internal_sku": v["sku"],
                    "snapshot_date": today,
                    "available_qty": v.get("inventoryQuantity") or 0,
                    "inbound_qty": 0,
                })
            if not data["pageInfo"]["hasNextPage"]:
                break
            cursor = data["pageInfo"]["endCursor"]

    return upsert(conn, "inventory", rows, conflict_keys=["channel", "internal_sku", "snapshot_date"])
