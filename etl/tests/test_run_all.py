"""CLI filter for the fast lane: run_all --only amazon_orders."""
from __future__ import annotations

from etl.run_all import PIPELINES, parse_only


def test_no_flag_runs_everything():
    assert parse_only([]) is None


def test_only_splits_and_strips():
    assert parse_only(["--only", " amazon_orders , amazon_returns "]) == {"amazon_orders", "amazon_returns"}


def test_fast_lane_source_exists():
    # etl-fast.yml depends on this name; fail loudly if a rename breaks it.
    assert "amazon_orders" in {m.SOURCE for m in PIPELINES}
