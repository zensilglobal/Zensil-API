"""Amazon SP-API auth — exchange the long-lived refresh token for a
short-lived access token (Login with Amazon). PRD §7.1 / §9.2 step 1."""
from __future__ import annotations

import httpx

from etl.settings import settings

LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token"


def get_access_token() -> str:
    resp = httpx.post(
        LWA_TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": settings.spapi_refresh_token,
            "client_id": settings.spapi_client_id,
            "client_secret": settings.spapi_client_secret,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def api_base() -> str:
    return f"https://{settings.amazon_region_host}"


def auth_headers() -> dict[str, str]:
    return {"x-amz-access-token": get_access_token(), "content-type": "application/json"}
