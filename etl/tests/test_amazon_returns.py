"""Unit tests for the FBA returns report parser (pure function, no network/DB)."""
from __future__ import annotations

from etl.pipelines.amazon_returns import parse_report

COLUMNS = [
    "return-date", "order-id", "sku", "asin", "fnsku", "product-name",
    "quantity", "fulfillment-center-id", "detailed-disposition", "reason",
    "status", "license-plate-number", "customer-comments",
]


def row(**overrides: str) -> str:
    base = {
        "return-date": "2026-06-20T10:11:12+00:00",
        "order-id": "408-1234567-0000001",
        "sku": "ZEN-001",
        "asin": "B0TEST0001",
        "fnsku": "X0TEST0001",
        "product-name": "Zensil Copper Bottle",
        "quantity": "1",
        "fulfillment-center-id": "DEL4",
        "detailed-disposition": "SELLABLE",
        "reason": "UNWANTED_ITEM",
        "status": "Unit returned to inventory",
        "license-plate-number": "LPN-AAA-111",
        "customer-comments": "",
    }
    base.update(overrides)
    return "\t".join(base[c] for c in COLUMNS)


def tsv(*rows: str) -> str:
    return "\n".join(["\t".join(COLUMNS), *rows])


def test_parses_rows_and_sku_master():
    skus, returns = parse_report(tsv(row(), row(sku="ZEN-002", **{"license-plate-number": "LPN-BBB-222"})))
    assert [s["internal_sku"] for s in skus] == ["ZEN-001", "ZEN-002"]
    assert skus[0]["product_name"] == "Zensil Copper Bottle"
    assert skus[0]["amazon_asin"] == "B0TEST0001"
    assert len(returns) == 2
    r = returns[0]
    assert r["channel"] == "amazon"
    assert r["return_id"] == "LPN-AAA-111"
    assert r["return_date"] == "2026-06-20"  # timestamp truncated to date
    assert r["reason"] == "UNWANTED_ITEM"
    assert r["qty"] == 1


def test_missing_lpn_falls_back_to_order_and_sku():
    _, returns = parse_report(tsv(row(**{"license-plate-number": ""})))
    assert returns[0]["return_id"] == "408-1234567-0000001:ZEN-001"


def test_duplicate_lpn_deduplicates():
    _, returns = parse_report(tsv(row(), row()))
    assert len(returns) == 1


def test_bad_quantity_defaults_to_one():
    _, returns = parse_report(tsv(row(quantity="n/a")))
    assert returns[0]["qty"] == 1


def test_skips_rows_without_sku_or_date():
    skus, returns = parse_report(tsv(row(sku=""), row(**{"return-date": ""})))
    assert skus == [] and returns == []


def test_empty_report():
    assert parse_report("") == ([], [])
