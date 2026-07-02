# Zensil — Multichannel Data & Decision Platform

A unified warehouse + Claude decision layer over **Amazon (Seller & Ads)**, **Flipkart**, and **Shopify** seller data.

```
APIs → Python ETL → PostgreSQL (Neon) → Dashboard + Claude (MCP) → Decisions
```

Production-grade, single-tenant. The dashboard runs on built-in sample data out of the box, then
swaps to the live Neon warehouse once `DATABASE_URL` + marketplace credentials are configured.

The **Next.js app lives at the repository root**, with `etl/` and `supabase/` (warehouse schema)
as sibling service folders. Hosting is self-managed via Docker (`docker compose up --build web`).

## Repository layout

| Path | What it is |
|------|------------|
| `app/` · `components/` · `lib/` | **Next.js 16 + TypeScript** operations dashboard (7 screens) — Tailwind v4 theme, Recharts, cookie auth, live Neon queries with sample-data fallback, global channel + date filters via URL state. |
| `supabase/migrations/` | Warehouse schema (channel-agnostic, incl. Shopify) + analytical views — applied to Neon via `etl/db/migrate.py`. |
| `supabase/seed.sql` | Representative demo data for local/preview. |
| `etl/` | **Python** ingestion — `auth/` (token refresh per source) + `pipelines/` (Amazon/Flipkart/Shopify) + `run_all.py` (orchestration, isolation, alerting). |
| `.github/workflows/` | `ci.yml` (lint/typecheck/build) and `etl.yml` (cron ingestion every 3h). |
| `Dockerfile` · `docker-compose.yml` | Web (Next standalone) + ETL containers. |
| `prototype/` | The original single-file HTML proof-of-concept (reference only). |

## Quick start

```bash
npm install && npm run dev   # http://localhost:3000 (sample data if DATABASE_URL unset)
```

Full setup (warehouse, credentials, scheduling, deploy, Claude MCP) → **[SETUP.md](SETUP.md)**.
Architecture and roadmap rationale → the PRD; the approved build plan covers stack decisions.

## Stack

- **Frontend**: Next.js 16 (App Router/RSC), TypeScript, Tailwind v4, Recharts, lucide-react.
- **Warehouse**: Neon (managed Postgres); business logic in SQL views so the dashboard and Claude always reconcile; self-contained HMAC-cookie auth (no external auth service).
- **ETL**: Python 3.12, httpx, psycopg, pydantic-settings; idempotent upserts; snapshot inventory; per-source isolation.
- **Ops**: GitHub Actions (cron + CI), Docker self-hosting (Next standalone), webhook/email alerting, Sentry-ready.

## Channels & constraints

Amazon · Flipkart · Shopify. Advertising data is **Amazon-only** (Flipkart and Shopify expose no
ingestible seller-ads API) — the Advertising screen handles this explicitly. Decisions are
human-in-the-loop: Claude analyses, the operator approves and executes.

## Brand palette

Crimson `#c22222` · obsidian black · imperial gold `#d4af37` · emerald `#2ecc71`.
Channel coding: Amazon `#d4af37` · Flipkart `#3f8fe0` · Shopify `#5fb87a`.
