"""Amazon FBA customer returns → returns table. Uses the SP-API Reports API
(async: request report → poll until DONE → download), same pattern as
amazon_inventory. Feeds the dashboard's Returns page (v_return_rate)."""
from __future__ import annotations

import datetime as dt
import gzip
import time

import httpx
import psycopg

from etl.auth import amazon_spapi
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "amazon_returns"
REPORT_TYPE = "GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA"
LOOKBACK_DAYS = 60  # rolling window; upserts make re-pulls idempotent


def enabled() -> bool:
    return settings.has_spapi()


def parse_report(tsv: str) -> tuple[list[dict], list[dict]]:
    """TSV report → (sku_master rows, returns rows). Pure — unit-testable."""
    lines = tsv.splitlines()
    if not lines:
        return [], []
    header = [h.strip() for h in lines[0].split("\t")]
    idx = {name: i for i, name in enumerate(header)}

    def col(cols: list[str], name: str, default: str = "") -> str:
        i = idx.get(name, -1)
        return cols[i] if 0 <= i < len(cols) else default

    sku_rows: dict[str, dict] = {}
    return_rows: dict[str, dict] = {}
    for line in lines[1:]:
        cols = line.split("\t")
        sku = col(cols, "sku").strip()
        return_date = col(cols, "return-date").strip()
        if not sku or not return_date:
            continue
        sku_rows.setdefault(sku, {
            "internal_sku": sku,
            "product_name": (col(cols, "product-name") or sku)[:300],
            "amazon_asin": col(cols, "asin") or None,
            "amazon_sku": sku,
            "cost_price": 0,
        })
        # license-plate-number is unique per returned unit; fall back to
        # order-id:sku so a missing LPN still yields a stable id.
        lpn = col(cols, "license-plate-number").strip()
        return_id = lpn or f"{col(cols, 'order-id')}:{sku}"
        try:
            qty = int(float(col(cols, "quantity") or "1"))
        except ValueError:
            qty = 1
        return_rows[return_id] = {
            "channel": "amazon",
            "return_id": return_id,
            "internal_sku": sku,
            "return_date": return_date[:10],  # ISO timestamp → date
            "reason": col(cols, "reason") or None,
            "qty": qty,
        }
    return list(sku_rows.values()), list(return_rows.values())


def fetch() -> tuple[list[dict], list[dict]]:
    """Request → poll → download the returns report. Holds NO DB conn."""
    headers = amazon_spapi.auth_headers()
    base = amazon_spapi.api_base()
    start = (dt.datetime.now(dt.UTC) - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()

    with httpx.Client(base_url=base, timeout=120) as client:
        create = client.post("/reports/2021-06-30/reports", headers=headers, json={
            "reportType": REPORT_TYPE,
            "marketplaceIds": [settings.amazon_marketplace_id],
            "dataStartTime": start,
        })
        create.raise_for_status()
        report_id = create.json()["reportId"]

        document_id = None
        for _ in range(40):
            status = client.get(f"/reports/2021-06-30/reports/{report_id}", headers=headers)
            status.raise_for_status()
            body = status.json()
            state = body["processingStatus"]
            if state == "DONE":
                document_id = body["reportDocumentId"]
                break
            if state == "CANCELLED":
                # Amazon cancels duplicate requests when nothing changed since
                # the last report — keep the previous data, don't fail.
                return [], []
            if state == "FATAL":
                raise RuntimeError(f"Amazon report {report_id} ended: {state}")
            time.sleep(10)
        if not document_id:
            raise TimeoutError("Amazon returns report did not complete in time.")

        doc = client.get(f"/reports/2021-06-30/documents/{document_id}", headers=headers)
        doc.raise_for_status()
        meta = doc.json()
        raw = httpx.get(meta["url"], timeout=120)
        if meta.get("compressionAlgorithm") == "GZIP":
            tsv = gzip.decompress(raw.content).decode("utf-8", errors="replace")
        else:
            tsv = raw.text

    return parse_report(tsv)


def persist(conn: psycopg.Connection, data: tuple[list[dict], list[dict]]) -> int:
    sku_rows, return_rows = data
    # sku_master first: returns.internal_sku has a FK to it.
    upsert(conn, "sku_master", sku_rows, conflict_keys=["internal_sku"],
           update_cols=["product_name", "amazon_asin", "amazon_sku"])
    return upsert(conn, "returns", return_rows, conflict_keys=["channel", "return_id"])


def run(conn: psycopg.Connection) -> int:
    return persist(conn, fetch())
