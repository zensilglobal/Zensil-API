"""Amazon Ads API auth — LWA refresh→access token + Profile ID header.
Refresh tokens may rotate on exchange; persist the latest if returned. PRD §7.2."""
from __future__ import annotations

import logging

import httpx

from etl.settings import settings

LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"
ADS_BASE = "https://advertising-api-eu.amazon.com"  # India is served by the EU region

log = logging.getLogger("zensil.etl")


def get_access_token() -> str:
    resp = httpx.post(
        LWA_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": settings.ads_refresh_token,
            "client_id": settings.ads_client_id,
            "client_secret": settings.ads_client_secret,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("refresh_token") and data["refresh_token"] != settings.ads_refresh_token:
        # TODO: persist the rotated refresh token back to the secret store.
        log.warning("Ads refresh token rotated — persist the new value to secrets.")
    return data["access_token"]


def auth_headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {get_access_token()}",
        "Amazon-Advertising-API-ClientId": settings.ads_client_id,
        "Amazon-Advertising-API-Scope": settings.ads_profile_id,
        "Content-Type": "application/json",
    }
