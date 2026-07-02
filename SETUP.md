# Zensil Ops — Setup Guide

This brings the platform from clone → deployed, in the order that keeps the
slow item (Amazon Ads approval) off the critical path.

## 0. Prerequisites
- Node 22+, Python 3.12+, a GitHub account, a Vercel account, a Supabase project.
- Install the Supabase CLI (optional, for local dev): `npm i -g supabase`.

## 1. Run the dashboard locally (no credentials needed)
```bash
cd apps/web
npm install
npm run dev      # http://localhost:3000 — runs on built-in sample data
```
With no Supabase env, auth is disabled and every screen renders from the sample
warehouse in `lib/data.ts`. This is the prototype parity build.

## 2. Stand up the warehouse (Supabase)
1. Create a Supabase project; copy the **Project URL**, **anon key**, **service-role key**, and **DB connection string**.
2. Apply the schema (Supabase SQL editor, or `supabase db push`):
   - `supabase/migrations/0001_init.sql` → `0002_views.sql` → `0003_rpc.sql` → `0004_security.sql`
   - Optionally load `supabase/seed.sql` for demo data.
3. Create the Claude read-only role (commented block at the bottom of `0004_security.sql`).

## 3. Point the dashboard at live data
Create `apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
Now `proxy.ts` enforces login and the data layer can call the `api_*` RPCs.
Create your operator user in Supabase Auth → Users.

## 4. Configure the ETL (per source — all free for own-account use)
Fill `etl/.env` (local) and **GitHub Actions Secrets** (production) from `.env.example`:

| Source | Where to get it |
|--------|-----------------|
| **Amazon SP-API** | Seller Central → register as developer → self-authorized app → Client ID + Secret + refresh token |
| **Amazon Ads** | advertising.amazon.com/about-api → apply as **Direct Advertiser** (2–3 days) → Client ID + Secret + refresh token + Profile ID. **Apply on day one.** |
| **Flipkart** | Seller Dashboard → Developer Access → self-access app → Application ID + Secret |
| **Shopify** | Admin → Settings → Apps → Develop apps → custom app → Admin API access token (read_orders, read_products, read_inventory) + store domain |
| **Alerting** | Slack/Telegram incoming webhook URL, or a Resend API key + email |

Run locally:
```bash
cd etl
pip install -e .
python -m etl.run_all     # pipelines without credentials are skipped, not failed
```

## 5. Schedule it
Push to GitHub. `.github/workflows/etl.yml` runs `run_all.py` every 3 hours using
the secrets above; failures alert via the webhook/email. `ci.yml` lints, type-checks
and builds the web app + lints the ETL on every PR.

## 6. Deploy the dashboard (Vercel)
This is a monorepo — the Next.js app lives in `apps/web`, so Vercel **must** be
pointed at that folder or you get *"Could not identify Next.js version"*.

1. Import the repo in Vercel.
2. **Settings → Build & Deployment → Root Directory → set to `apps/web`** (do **not** leave it at the repository root). Vercel then auto-detects Next.js — no `vercel.json` needed.
3. **Settings → Environment Variables** — add:
   - `DATABASE_URL` — your Neon connection string (dashboard reads it server-side)
   - `APP_AUTH_EMAIL`, `APP_AUTH_PASSWORD`, `APP_AUTH_SECRET` — login
   - `ANTHROPIC_API_KEY` — optional (real Claude answers)
4. Redeploy. Preview URLs per PR.

## 7. Connect Claude (MCP)
Point a Postgres MCP server at the `zensil_readonly` role and add it as a custom
connector in a "Zensil Ops" Claude Project whose instructions hold the schema,
unit economics, and decision thresholds (PRD §11). The dashboard's `/api/claude`
route can also be upgraded to call the Claude API directly once `ANTHROPIC_API_KEY` is set.

## Business inputs needed before go-live
Per-SKU **cost price + target margin** (→ `sku_master`), target **ACOS**, and
**days-of-cover** thresholds for the decision library.
