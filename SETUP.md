# Zensil Ops — Setup Guide

This brings the platform from clone → deployed, in the order that keeps the
slow item (Amazon Ads approval) off the critical path.

## 0. Prerequisites
- Node 22+, Python 3.12+, a GitHub account, a Neon project (free tier works).
- Docker (for the self-hosted deploy in step 6).

## 1. Run the dashboard locally (no credentials needed)
```bash
npm install
npm run dev      # http://localhost:3000 — runs from the repo root
```
With no `DATABASE_URL`, every screen renders from the sample warehouse in
`lib/data.ts`. Login is always on (self-contained cookie auth); default
credentials come from `APP_AUTH_EMAIL` / `APP_AUTH_PASSWORD`.

## 2. Stand up the warehouse (Neon)
1. Create a Neon project; copy the **pooled connection string** (`...-pooler...` host, `sslmode=require`).
2. Put it in `etl/.env` as `DATABASE_URL`, then apply the schema (from the repo root):
   ```bash
   pip install -e etl
   python -m etl.db.migrate --seed   # --seed loads supabase/seed.sql demo data; omit for a clean warehouse
   ```
   This runs `supabase/migrations/0001…0004` in order.
3. Create the Claude read-only role (commented block at the bottom of `0004_security.sql`).

## 3. Point the dashboard at live data
Create `.env.local` at the repo root (see `.env.example`):
```
DATABASE_URL=postgresql://...        # the same Neon pooled connection string
APP_AUTH_EMAIL=office@zensil.in      # dashboard login
APP_AUTH_PASSWORD=<strong password>
APP_AUTH_SECRET=<long random string> # signs the session cookie
ANTHROPIC_API_KEY=                   # optional — real Claude answers in /insights
```
With `DATABASE_URL` set, `lib/queries.ts` switches every screen from sample data
to live Neon queries; `proxy.ts` enforces the cookie login on all pages.

## 4. Configure the ETL (per source — all free for own-account use)
Fill `etl/.env` (local) and **GitHub Actions Secrets** (production) from `.env.example`:

| Source | Where to get it |
|--------|-----------------|
| **Amazon SP-API** | Seller Central → register as developer → self-authorized app → Client ID + Secret + refresh token |
| **Amazon Ads** | advertising.amazon.com/about-api → apply as **Direct Advertiser** (2–3 days) → Client ID + Secret + refresh token + Profile ID. **Apply on day one.** |
| **Flipkart** | Seller Dashboard → Developer Access → self-access app → Application ID + Secret |
| **Shopify** | Admin → Settings → Apps → Develop apps → custom app → Admin API access token (read_orders, read_products, read_inventory) + store domain |
| **Alerting** | Slack/Telegram incoming webhook URL, or a Resend API key + email |

Run locally (from the repo root):
```bash
pip install -e etl
python -m etl.run_all     # pipelines without credentials are skipped, not failed
```

## 5. Schedule it
Push to GitHub. `.github/workflows/etl.yml` runs `run_all.py` every 3 hours using
the secrets above; failures alert via the webhook/email. `ci.yml` lints, type-checks
and builds the web app + lints the ETL on every PR.

## 6. Deploy the dashboard (self-hosted, Docker)
The app builds to a minimal Next.js **standalone** server (`output: "standalone"`),
so the image is small and needs only Node — no platform lock-in.

On any box with Docker (VPS, home server, NAS):
```bash
git clone <repo> && cd <repo>
# create .env.local with the runtime vars from step 3
docker compose up --build -d web        # dashboard on http://<host>:3000
```
Env vars are injected at **runtime** via `.env.local` (`docker compose` reads it
through `env_file`), so you can rotate credentials with just a container restart —
no rebuild needed. Put a reverse proxy (Caddy/nginx/Traefik) in front for TLS.

To update: `git pull && docker compose up --build -d web`.

## 7. Connect Claude (MCP)
Point a Postgres MCP server at the `zensil_readonly` role and add it as a custom
connector in a "Zensil Ops" Claude Project whose instructions hold the schema,
unit economics, and decision thresholds (PRD §11). The dashboard's `/api/claude`
route can also be upgraded to call the Claude API directly once `ANTHROPIC_API_KEY` is set.

## Business inputs needed before go-live
Per-SKU **cost price + target margin** (→ `sku_master`), target **ACOS**, and
**days-of-cover** thresholds for the decision library.
