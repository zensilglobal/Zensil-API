"""Postgres connection + a generic idempotent upsert helper (PRD §9)."""
from __future__ import annotations

import time
from collections.abc import Iterable, Sequence
from contextlib import contextmanager
from typing import Any

import psycopg

from etl.settings import settings


def _connect(retries: int = 3) -> psycopg.Connection:
    """Neon's compute may be cold on the first connect — retry briefly."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            return psycopg.connect(
                settings.database_url,
                autocommit=False,
                connect_timeout=30,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
            )
        except psycopg.OperationalError as exc:
            last = exc
            if attempt < retries - 1:
                time.sleep(3)
    raise RuntimeError(f"could not connect to the warehouse after {retries} attempts: {last!r}")


@contextmanager
def get_conn():
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set — cannot connect to the warehouse.")
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def upsert(
    conn: psycopg.Connection,
    table: str,
    rows: Sequence[dict[str, Any]],
    conflict_keys: Iterable[str],
    update_cols: Iterable[str] | None = None,
) -> int:
    """INSERT ... ON CONFLICT DO UPDATE. Re-runs are safe (idempotent)."""
    rows = list(rows)
    if not rows:
        return 0
    cols = list(rows[0].keys())
    conflict = ", ".join(conflict_keys)
    updates = update_cols if update_cols is not None else [c for c in cols if c not in set(conflict_keys)]
    set_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in updates)
    placeholders = ", ".join(["%s"] * len(cols))
    action = f"DO UPDATE SET {set_clause}" if updates else "DO NOTHING"
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({conflict}) {action}"
    )
    with conn.cursor() as cur:
        cur.executemany(sql, [tuple(r[c] for c in cols) for r in rows])
    return len(rows)


def mark_sync(conn: psycopg.Connection, source: str, status: str = "ok") -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sync_state (source, last_synced_at, last_status, updated_at)
            VALUES (%s, now(), %s, now())
            ON CONFLICT (source) DO UPDATE
              SET last_synced_at = now(), last_status = EXCLUDED.last_status, updated_at = now()
            """,
            (source, status),
        )
