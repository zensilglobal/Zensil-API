"""Flipkart inventory → daily snapshot per SKU (never overwrite)."""
from __future__ import annotations

import datetime as dt

import httpx
import psycopg

from etl.auth import flipkart
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "flipkart_inventory"


def enabled() -> bool:
    return settings.has_flipkart()


def run(conn: psycopg.Connection) -> int:
    headers = flipkart.auth_headers()
    today = dt.date.today().isoformat()
    rows: list[dict] = []

    with httpx.Client(base_url=flipkart.API_BASE, timeout=60) as client:
        # Pull: GET /listings/v3/... for stock per SKU (paginate as needed).
        resp = client.get("/listings/v3/inventory", headers=headers)
        resp.raise_for_status()
        for listing in resp.json().get("listings", []):
            rows.append({
                "channel": "flipkart",
                "internal_sku": listing.get("sku"),
                "snapshot_date": today,
                "available_qty": listing.get("availableQuantity", 0),
                "inbound_qty": 0,
            })

    return upsert(conn, "inventory", rows, conflict_keys=["channel", "internal_sku", "snapshot_date"])
