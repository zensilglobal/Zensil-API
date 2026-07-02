"""Failure alerting — the half of n8n we replaced (PRD §10.3). Do not skip."""
from __future__ import annotations

import logging

import httpx

from etl.settings import settings

log = logging.getLogger("zensil.etl")


def alert(subject: str, message: str) -> None:
    """Send a failure/notice to the configured channel; always log too."""
    log.error("%s — %s", subject, message)
    body = f"*{subject}*\n{message}"

    if settings.alert_webhook_url:
        try:
            httpx.post(settings.alert_webhook_url, json={"text": body}, timeout=10)
        except Exception as exc:  # noqa: BLE001 — alerting must never crash the run
            log.warning("alert webhook failed: %s", exc)

    if settings.resend_api_key and settings.alert_email_to:
        try:
            httpx.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": "Zensil Ops <ops@zensil.in>",
                    "to": [settings.alert_email_to],
                    "subject": f"[Zensil ETL] {subject}",
                    "text": message,
                },
                timeout=10,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("alert email failed: %s", exc)
