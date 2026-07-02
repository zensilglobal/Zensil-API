"""Central configuration loaded from environment / .env (never committed)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve etl/.env by absolute path so the ETL works regardless of the current
# working directory (project root, etl/, or CI). Real environment variables
# still take precedence over the file (GitHub Actions Secrets / Vercel).
_ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    # --- Warehouse ---
    database_url: str = ""  # postgres connection string (service role)

    # --- Amazon SP-API ---
    amazon_marketplace_id: str = "A21TJRUUN4KGV"  # Amazon.in
    amazon_region_host: str = "sellingpartnerapi-eu.amazon.com"
    spapi_client_id: str = ""
    spapi_client_secret: str = ""
    spapi_refresh_token: str = ""

    # --- Amazon Ads API ---
    ads_client_id: str = ""
    ads_client_secret: str = ""
    ads_refresh_token: str = ""
    ads_profile_id: str = ""

    # --- Flipkart Marketplace API ---
    flipkart_app_id: str = ""
    flipkart_app_secret: str = ""

    # --- Shopify Admin API ---
    shopify_store_domain: str = ""  # e.g. zensil.myshopify.com
    shopify_access_token: str = ""
    shopify_api_version: str = "2025-01"

    # --- Alerting ---
    alert_webhook_url: str = ""  # Slack / Telegram incoming webhook
    alert_email_to: str = ""
    resend_api_key: str = ""

    def has_spapi(self) -> bool:
        return all([self.spapi_client_id, self.spapi_client_secret, self.spapi_refresh_token])

    def has_ads(self) -> bool:
        return all([self.ads_client_id, self.ads_client_secret, self.ads_refresh_token, self.ads_profile_id])

    def has_flipkart(self) -> bool:
        return all([self.flipkart_app_id, self.flipkart_app_secret])

    def has_shopify(self) -> bool:
        return all([self.shopify_store_domain, self.shopify_access_token])


settings = Settings()
