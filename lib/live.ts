import "server-only";
import { LiveTile } from "./types";
import { inrK, num } from "./format";

/*
  LIVE STRIP — the only code path that talks to a marketplace API at request
  time. Everything else on the dashboard reads the warehouse, and must keep
  doing so: the historical, cross-channel and margin numbers depend on joins
  (order_items × orders × sku_master), on cost_price, and on report jobs that
  no API answers in one round trip.

  What qualifies for a tile here is narrow: one HTTP call, no pagination
  beyond a single follow-up page, no per-order fan-out. Amazon orders appear
  WITHOUT line items for exactly this reason — etl/pipelines/amazon_orders.py
  spends one rate-limited call per order to get them, which is minutes, not
  milliseconds.

  Credentials are the same env vars the Python ETL reads (etl/settings.py maps
  them case-insensitively), so a working pipeline means a working tile.
*/

const TIMEOUT_MS = 8_000;

/*
  Request-time API calls share a rate-limit budget with the ETL scheduler, so
  results are memoised in-process and every viewer refreshing the dashboard
  hits the same entry.

  SP-API getOrders is the binding constraint: 0.0167 requests/sec sustained
  (one per minute) with a burst bucket of 20. A 90 s TTL keeps the strip below
  that ceiling no matter how many people have the tab open, and still leaves
  the bucket room for the half-hourly orders sync. Shopify's leaky bucket is
  far more forgiving (~2 req/s), so it refreshes on a 20 s TTL.

  Failures are cached on the same TTL as successes — deliberately. An expired
  token returning 401 on every render would otherwise hammer the endpoint,
  and for SP-API a throttled 429 retried on a loop never recovers.
*/
const AMAZON_TTL = 90_000;
const SHOPIFY_TTL = 20_000;

const memory = new Map<string, { at: number; tiles: LiveTile[] }>();

async function memo(key: string, ttlMs: number, load: () => Promise<LiveTile[]>): Promise<LiveTile[]> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.tiles;
  const tiles = await load();
  memory.set(key, { at: Date.now(), tiles });
  return tiles;
}

function shopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN);
}

function amazonConfigured(): boolean {
  return Boolean(
    process.env.SPAPI_CLIENT_ID && process.env.SPAPI_CLIENT_SECRET && process.env.SPAPI_REFRESH_TOKEN,
  );
}

/** False when no marketplace credentials exist at all — the strip renders nothing. */
export function liveEnabled(): boolean {
  return shopifyConfigured() || amazonConfigured();
}

/**
 * Start of today in IST as an ISO timestamp. India observes no DST, so the
 * fixed +05:30 offset is exact year-round — no tz database needed.
 */
function istTodayStart(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${p(ist.getUTCMonth() + 1)}-${p(ist.getUTCDate())}T00:00:00+05:30`;
}

function errorTile(key: string, label: string, source: LiveTile["source"], err: unknown): LiveTile {
  return {
    key,
    label,
    source,
    value: "—",
    // The real cause, not "unavailable" — a 401 means the token, a 403 means
    // the SP-API role grant, and the distinction is the whole diagnosis.
    sub: err instanceof Error ? err.message : String(err),
    error: true,
  };
}

/* ------------------------------------------------------------------ Shopify */

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const version = process.env.SHOPIFY_API_VERSION || "2025-01";
  const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] | string };
  // GraphQL errors come back as an array of objects, but auth and throttling
  // failures use a bare string under the same key. Indexing a string would
  // report its first character as the message.
  if (json.errors) {
    const detail = typeof json.errors === "string" ? json.errors : json.errors[0]?.message;
    if (detail) throw new Error(`Shopify: ${detail}`);
  }
  if (!json.data) throw new Error("Shopify returned no data");
  return json.data;
}

const TODAY_ORDERS_QUERY = `
  query LiveTodayOrders($q: String!) {
    orders(first: 250, query: $q, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage }
      nodes {
        test
        cancelledAt
        currentTotalPriceSet { shopMoney { amount } }
      }
    }
  }`;

const STOCK_QUERY = `
  query LiveStock {
    productVariants(first: 250) {
      pageInfo { hasNextPage }
      nodes { inventoryQuantity }
    }
  }`;

interface OrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean };
    nodes: { test: boolean; cancelledAt: string | null; currentTotalPriceSet: { shopMoney: { amount: string } } }[];
  };
}

interface StockResponse {
  productVariants: { pageInfo: { hasNextPage: boolean }; nodes: { inventoryQuantity: number | null }[] };
}

async function shopifyTiles(): Promise<LiveTile[]> {
  // Two independent single-call queries; one failing must not blank the other.
  const [orders, stock] = await Promise.allSettled([
    shopifyGraphql<OrdersResponse>(TODAY_ORDERS_QUERY, { q: `created_at:>='${istTodayStart()}'` }),
    shopifyGraphql<StockResponse>(STOCK_QUERY),
  ]);

  const tiles: LiveTile[] = [];

  if (orders.status === "fulfilled") {
    // Test orders and cancellations would inflate the number a seller reads as
    // "money taken today".
    const real = orders.value.orders.nodes.filter((o) => !o.test && !o.cancelledAt);
    const revenue = real.reduce((sum, o) => sum + Number(o.currentTotalPriceSet.shopMoney.amount || 0), 0);
    // 250 is one page; past that the count is a floor, so say so rather than
    // paginate and break the one-call budget.
    const capped = orders.value.orders.pageInfo.hasNextPage;
    tiles.push({
      key: "shopify-today",
      label: "Shopify Today",
      source: "shopify",
      value: inrK(revenue),
      sub: `${num(real.length)}${capped ? "+" : ""} orders · since 12 AM IST`,
    });
  } else {
    tiles.push(errorTile("shopify-today", "Shopify Today", "shopify", orders.reason));
  }

  if (stock.status === "fulfilled") {
    const qty = stock.value.productVariants.nodes.map((v) => v.inventoryQuantity ?? 0);
    const units = qty.reduce((a, b) => a + b, 0);
    const out = qty.filter((n) => n <= 0).length;
    tiles.push({
      key: "shopify-stock",
      label: "Stock On Hand",
      source: "shopify",
      value: num(units),
      sub: `${num(qty.length)}${stock.value.productVariants.pageInfo.hasNextPage ? "+" : ""} SKUs · ${num(out)} out of stock`,
    });
  } else {
    tiles.push(errorTile("shopify-stock", "Stock On Hand", "shopify", stock.reason));
  }

  return tiles;
}

/* ------------------------------------------------------------------- Amazon */

/** Mint a short-lived SP-API access token from the long-lived refresh token. */
async function amazonAccessToken(): Promise<string> {
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.SPAPI_REFRESH_TOKEN!,
      client_id: process.env.SPAPI_CLIENT_ID!,
      client_secret: process.env.SPAPI_CLIENT_SECRET!,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Amazon LWA ${res.status} — refresh token rejected`);
  return ((await res.json()) as { access_token: string }).access_token;
}

interface SpapiOrder {
  OrderStatus?: string;
  OrderTotal?: { Amount?: string };
}

async function amazonTiles(): Promise<LiveTile[]> {
  const label = "Amazon 24 h";
  try {
    const token = await amazonAccessToken();
    const base = `https://${process.env.AMAZON_REGION_HOST || "sellingpartnerapi-eu.amazon.com"}`;
    const marketplace = process.env.AMAZON_MARKETPLACE_ID || "A21TJRUUN4KGV";
    const createdAfter = new Date(Date.now() - 24 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");

    const orders: SpapiOrder[] = [];
    let nextToken: string | undefined;

    // At most two pages (200 orders). Beyond that the tile reports a floor —
    // a third call would start eating the getOrders burst bucket.
    for (let page = 0; page < 2; page++) {
      const params = new URLSearchParams(
        nextToken
          ? { NextToken: nextToken }
          : { MarketplaceIds: marketplace, CreatedAfter: createdAfter, MaxResultsPerPage: "100" },
      );
      const res = await fetch(`${base}/orders/v0/orders?${params}`, {
        headers: { "x-amz-access-token": token, "content-type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        // SP-API puts the actionable detail in the body — a 403 here is
        // almost always a missing role on the app, not a bad token.
        const body = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
        const detail = body?.errors?.[0]?.message;
        throw new Error(`SP-API ${res.status}${detail ? ` — ${detail}` : ""}`);
      }
      const payload = ((await res.json()) as { payload?: { Orders?: SpapiOrder[]; NextToken?: string } }).payload ?? {};
      orders.push(...(payload.Orders ?? []));
      nextToken = payload.NextToken;
      if (!nextToken) break;
    }

    const real = orders.filter((o) => !(o.OrderStatus || "").toLowerCase().includes("cancel"));
    const revenue = real.reduce((sum, o) => sum + Number(o.OrderTotal?.Amount || 0), 0);
    return [
      {
        key: "amazon-24h",
        label,
        source: "amazon",
        value: inrK(revenue),
        sub: `${num(real.length)}${nextToken ? "+" : ""} orders · rolling 24 h`,
      },
    ];
  } catch (err) {
    return [errorTile("amazon-24h", label, "amazon", err)];
  }
}

/* -------------------------------------------------------------------- Entry */

/**
 * Every configured source, fetched concurrently. Never throws: a dead
 * marketplace degrades to an error tile so the warehouse-backed dashboard
 * below it still renders.
 */
export async function getLiveTiles(): Promise<LiveTile[]> {
  const jobs: Promise<LiveTile[]>[] = [];
  if (shopifyConfigured()) jobs.push(memo("shopify", SHOPIFY_TTL, shopifyTiles));
  if (amazonConfigured()) jobs.push(memo("amazon", AMAZON_TTL, amazonTiles));

  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [errorTile("live-error", "Live", "shopify", r.reason)],
  );
}

/** Fetch time, rendered server-side in IST so the string hydrates identically. */
export function liveStamp(): string {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
