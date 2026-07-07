"""Amazon inventory → daily snapshot. Uses the SP-API Reports API
(async: request report → poll until DONE → download). Splits fetch()/persist()
so the warehouse connection is never held open during the poll. PRD §7.1 / §9.2."""
from __future__ import annotations

import datetime as dt
import time

import httpx
import psycopg

from etl.auth import amazon_spapi
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "amazon_inventory"
REPORT_TYPE = "GET_FBA_MYI_UNSUPPRESSED_INVENTORY_DATA"


def enabled() -> bool:
    return settings.has_spapi()


def fetch() -> tuple[list[dict], list[dict]]:
    """Request → poll → download the FBA inventory report. Holds NO DB conn."""
    headers = amazon_spapi.auth_headers()
    base = amazon_spapi.api_base()
    today = dt.date.today().isoformat()

    with httpx.Client(base_url=base, timeout=120) as client:
        create = client.post("/reports/2021-06-30/reports", headers=headers, json={
            "reportType": REPORT_TYPE,
            "marketplaceIds": [settings.amazon_marketplace_id],
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
                # the last report — keep the previous snapshot, don't fail.
                return [], []
            if state == "FATAL":
                raise RuntimeError(f"Amazon report {report_id} ended: {state}")
            time.sleep(10)
        if not document_id:
            raise TimeoutError("Amazon inventory report did not complete in time.")

        doc = client.get(f"/reports/2021-06-30/documents/{document_id}", headers=headers)
        doc.raise_for_status()
        tsv = httpx.get(doc.json()["url"], timeout=120).text

    lines = tsv.splitlines()
    if not lines:
        return [], []
    header = [h.strip() for h in lines[0].split("\t")]
    idx = {name: i for i, name in enumerate(header)}

    def col(cols: list[str], name: str, default: str = "") -> str:
        i = idx.get(name, -1)
        return cols[i] if 0 <= i < len(cols) else default

    def to_int(v: str) -> int:
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return 0

    sku_rows: dict[str, dict] = {}
    inv_rows: list[dict] = []
    for line in lines[1:]:
        cols = line.split("\t")
        sku = col(cols, "sku").strip()
        if not sku:
            continue
        sku_rows.setdefault(sku, {
            "internal_sku": sku,
            "product_name": (col(cols, "product-name") or sku)[:300],
            "amazon_asin": col(cols, "asin") or None,
            "amazon_sku": sku,
            "cost_price": 0,
        })
        inbound = (
            to_int(col(cols, "afn-inbound-working-quantity"))
            + to_int(col(cols, "afn-inbound-shipped-quantity"))
            + to_int(col(cols, "afn-inbound-receiving-quantity"))
        )
        inv_rows.append({
            "channel": "amazon",
            "internal_sku": sku,
            "snapshot_date": today,
            "available_qty": to_int(col(cols, "afn-fulfillable-quantity")),
            "inbound_qty": inbound,
        })
    return list(sku_rows.values()), inv_rows


def persist(conn: psycopg.Connection, data: tuple[list[dict], list[dict]]) -> int:
    sku_rows, inv_rows = data
    upsert(conn, "sku_master", sku_rows, conflict_keys=["internal_sku"],
           update_cols=["product_name", "amazon_asin", "amazon_sku"])
    return upsert(conn, "inventory", inv_rows, conflict_keys=["channel", "internal_sku", "snapshot_date"])


def run(conn: psycopg.Connection) -> int:
    return persist(conn, fetch())
