"""Flipkart Marketplace API auth — client-credentials bearer token.
Token lives ~60 days; expired tokens return 401, so we cache + pre-emptively
regenerate. PRD §7.3 / §9.2 step 1 (the part n8n hides)."""
from __future__ import annotations

import base64
import time

import httpx

from etl.settings import settings

TOKEN_URL = "https://api.flipkart.net/oauth-service/oauth/token"
API_BASE = "https://api.flipkart.net/sellers"

_cache: dict[str, float | str] = {"token": "", "expires_at": 0.0}


def get_access_token() -> str:
    now = time.time()
    if _cache["token"] and float(_cache["expires_at"]) - 300 > now:
        return str(_cache["token"])

    basic = base64.b64encode(f"{settings.flipkart_app_id}:{settings.flipkart_app_secret}".encode()).decode()
    resp = httpx.get(
        TOKEN_URL,
        params={"grant_type": "client_credentials", "scope": "Seller_Api"},
        headers={"Authorization": f"Basic {basic}"},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    _cache["token"] = data["access_token"]
    _cache["expires_at"] = now + float(data.get("expires_in", 3600))
    return str(_cache["token"])


def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_access_token()}", "Content-Type": "application/json"}
