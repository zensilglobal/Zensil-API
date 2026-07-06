"""Scheduler entrypoint (PRD §9.1). Runs every pipeline in isolation so one
API failure never blocks the others, marks sync_state, and alerts on failure
(the half of n8n we replaced)."""
from __future__ import annotations

import logging
import sys

from etl.alerting import alert
from etl.db.client import get_conn, mark_sync
from etl.pipelines import (
    amazon_ads_reports,
    amazon_inventory,
    amazon_orders,
    amazon_returns,
    flipkart_inventory,
    flipkart_orders,
    shopify_inventory,
    shopify_orders,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("zensil.etl")

PIPELINES = [
    amazon_orders,
    amazon_inventory,
    amazon_returns,
    amazon_ads_reports,
    flipkart_orders,
    flipkart_inventory,
    shopify_orders,
    shopify_inventory,
]


def main() -> int:
    failures = 0
    ran = 0
    for mod in PIPELINES:
        source = mod.SOURCE
        if not mod.enabled():
            log.info("· %s — skipped (credentials not configured)", source)
            continue
        ran += 1
        try:
            # Fetch BEFORE opening the warehouse connection: the rate-limited
            # API calls take minutes and Neon's pooler drops idle sessions
            # ("SSL connection has been closed unexpectedly").
            data = mod.fetch()
            with get_conn() as conn:
                count = mod.persist(conn, data)
                mark_sync(conn, source, "ok")
            log.info("✓ %s — %s records", source, count)
        except Exception as exc:  # noqa: BLE001 — isolate per source
            failures += 1
            log.exception("✗ %s failed", source)
            alert(f"Pipeline failed: {source}", repr(exc))
            try:
                with get_conn() as conn:
                    mark_sync(conn, source, f"error: {exc!r}"[:300])
            except Exception:  # noqa: BLE001
                pass

    log.info("Run complete — %d ran, %d failed, %d skipped", ran, failures, len(PIPELINES) - ran)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
