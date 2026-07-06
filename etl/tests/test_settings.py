"""Credential-gating logic: a pipeline must never run half-configured."""
from __future__ import annotations

from etl.settings import Settings


def make(**kwargs: str) -> Settings:
    return Settings(_env_file=None, **kwargs)  # ignore etl/.env — test in isolation


def test_spapi_requires_all_three():
    assert not make().has_spapi()
    assert not make(spapi_client_id="a", spapi_client_secret="b").has_spapi()
    assert make(spapi_client_id="a", spapi_client_secret="b", spapi_refresh_token="c").has_spapi()


def test_shopify_requires_domain_and_token():
    assert not make(shopify_store_domain="x.myshopify.com").has_shopify()
    assert make(shopify_store_domain="x.myshopify.com", shopify_access_token="shpat_x").has_shopify()


def test_ads_requires_all_four():
    assert not make(ads_client_id="a", ads_client_secret="b", ads_refresh_token="c").has_ads()
    assert make(ads_client_id="a", ads_client_secret="b", ads_refresh_token="c", ads_profile_id="d").has_ads()
