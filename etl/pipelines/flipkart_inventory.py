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


def fetch() -> list[dict]:
    """Pull + transform. Holds NO DB conn (Neon drops idle sessions)."""
    headers = flipkart.auth_headers()
    today = dt.date.today().isoformat()
    rows: list[dict] = []

    with httpx.Client(base_url=flipkart.API_BASE, timeout=60) as client:
        # Pull: GET /listings/v3/... for stock per SKU (paginate as needed).
        resp = client.get("/listings/v3/inventory", headers=headers)
        resp.raise_for_status()
        for listing in resp.json().get("listings", []):
            qty = listing.get("availableQuantity", 0)
            rows.append({
                "channel": "flipkart",
                "internal_sku": listing.get("sku"),
                "snapshot_date": today,
                "available_qty": qty,
                "inbound_qty": 0,
                # Flipkart stock is seller-fulfilled — no FBA equivalent.
                "fba_qty": 0,
                "easyship_qty": qty,
            })
    return rows


def persist(conn: psycopg.Connection, rows: list[dict]) -> int:
    return upsert(conn, "inventory", rows, conflict_keys=["channel", "internal_sku", "snapshot_date"])


def run(conn: psycopg.Connection) -> int:
    return persist(conn, fetch())
