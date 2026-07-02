"""Amazon Ads → ad_spend (campaign / keyword / search-term performance).
Amazon-only capability. Powers wasted-spend & ACOS analysis. PRD §7.2 / FR-01/02/03.
Requires Direct Advertiser approval (longest lead-time item)."""
from __future__ import annotations

import datetime as dt
import time

import httpx
import psycopg

from etl.auth import amazon_ads
from etl.db.client import upsert
from etl.settings import settings

SOURCE = "amazon_ads_reports"


def enabled() -> bool:
    return settings.has_ads()


def run(conn: psycopg.Connection) -> int:
    headers = amazon_ads.auth_headers()
    report_date = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    rows: list[dict] = []

    with httpx.Client(base_url=amazon_ads.ADS_BASE, timeout=120) as client:
        # 1) request a v3 reporting job (search-term report for Sponsored Products)
        create = client.post("/reporting/reports", headers=headers, json={
            "name": f"zensil-st-{report_date}",
            "startDate": report_date,
            "endDate": report_date,
            "configuration": {
                "adProduct": "SPONSORED_PRODUCTS",
                "groupBy": ["searchTerm"],
                "columns": ["campaignName", "adGroupName", "searchTerm",
                            "impressions", "clicks", "cost", "sales30d", "purchases30d"],
                "reportTypeId": "spSearchTerm",
                "timeUnit": "SUMMARY",
                "format": "GZIP_JSON",
            },
        })
        create.raise_for_status()
        report_id = create.json()["reportId"]

        # 2) poll until COMPLETED
        url = None
        for _ in range(30):
            status = client.get(f"/reporting/reports/{report_id}", headers=headers)
            status.raise_for_status()
            body = status.json()
            if body["status"] == "COMPLETED":
                url = body["url"]
                break
            if body["status"] == "FAILURE":
                raise RuntimeError(f"Ads report {report_id} failed")
            time.sleep(10)
        if not url:
            raise TimeoutError("Amazon Ads report did not complete in time.")

        # 3) download + transform (GZIP JSON array of rows)
        import gzip
        import json

        raw = httpx.get(url, timeout=120).content
        records = json.loads(gzip.decompress(raw))
        for r in records:
            rows.append({
                "report_date": report_date,
                "campaign": r.get("campaignName", ""),
                "ad_group": r.get("adGroupName", ""),
                "keyword_or_search_term": r.get("searchTerm", ""),
                "impressions": r.get("impressions", 0),
                "clicks": r.get("clicks", 0),
                "spend": r.get("cost", 0),
                "attributed_sales": r.get("sales30d", 0),
                "orders": r.get("purchases30d", 0),
            })

    return upsert(
        conn, "ad_spend", rows,
        conflict_keys=["report_date", "campaign", "ad_group", "keyword_or_search_term"],
    )
