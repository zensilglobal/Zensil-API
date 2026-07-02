"""Shopify Admin API auth — a custom-app Admin API access token sent as a
header. Reads use the GraphQL Admin API."""
from __future__ import annotations

from etl.settings import settings


def graphql_url() -> str:
    return f"https://{settings.shopify_store_domain}/admin/api/{settings.shopify_api_version}/graphql.json"


def auth_headers() -> dict[str, str]:
    return {
        "X-Shopify-Access-Token": settings.shopify_access_token,
        "Content-Type": "application/json",
    }
