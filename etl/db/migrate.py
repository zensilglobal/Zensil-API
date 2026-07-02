"""Apply the warehouse schema + seed to the database in DATABASE_URL.

Usage (from the project root):
    PYTHONPATH=. python -m etl.db.migrate           # schema only
    PYTHONPATH=. python -m etl.db.migrate --seed     # schema + demo seed data

Idempotent: migrations use IF NOT EXISTS / CREATE OR REPLACE and the seed uses
ON CONFLICT, so re-running is safe. Retries the first connect to absorb a Neon
cold-start (compute wakes on the first query after auto-suspend).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import psycopg

from etl.settings import settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
SEED_FILE = Path(__file__).resolve().parents[2] / "supabase" / "seed.sql"


def _connect(retries: int = 5, timeout: int = 30) -> psycopg.Connection:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set.")
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return psycopg.connect(settings.database_url, connect_timeout=timeout, autocommit=True)
        except psycopg.OperationalError as exc:  # cold start / transient
            last = exc
            print(f"  connect attempt {attempt}/{retries} failed ({exc.__class__.__name__}); retrying…")
            time.sleep(3)
    raise RuntimeError(f"could not connect after {retries} attempts: {last!r}")


def main(seed: bool = False) -> int:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print(f"No migrations found in {MIGRATIONS_DIR}")
        return 1
    print(f"Connecting to {settings.database_url.split('@')[-1].split('?')[0]} …")
    with _connect() as conn:
        for f in files:
            sql = f.read_text(encoding="utf-8")
            # psycopg3 runs a multi-statement script (incl. dollar-quoted
            # DO/function bodies) in one execute() when no params are passed.
            conn.execute(sql)
            print(f"  [ok] applied {f.name}")
        if seed:
            conn.execute(SEED_FILE.read_text(encoding="utf-8"))
            print(f"  [ok] applied {SEED_FILE.name}")
        tables = conn.execute(
            "select table_name from information_schema.tables "
            "where table_schema='public' order by 1"
        ).fetchall()
        print("Tables:", ", ".join(t[0] for t in tables) or "(none)")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(seed="--seed" in sys.argv))
