import { NextRequest } from "next/server";
import { q, warehouseEnabled } from "@/lib/db";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Reviews CSV import — the ingestion path for the Reviews section.
  Marketplaces expose no seller-facing reviews API, so reviews arrive as
  CSV exports (Amazon Brand Registry, Flipkart seller portal, Shopify
  review apps) and are upserted here.

  Expected header (order-free, case-insensitive):
    channel, sku, rating, date [, title, body, author, verified, review_id]
  Unknown SKUs are skipped (FK to sku_master); duplicate review_ids are
  ignored so re-importing the same file is safe.
*/

const CHANNELS = new Set(["amazon", "flipkart", "shopify"]);
const MAX_ROWS = 5000;

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, newlines in fields). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  // accept yyyy-mm-dd or dd/mm/yyyy or dd-mm-yyyy
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** stable fallback id so re-imports of files without review_id stay idempotent */
function stableId(parts: string[]): string {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "CSV-" + h.toString(16).padStart(8, "0");
}

export async function POST(request: NextRequest) {
  const session = await verifyToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  if (!warehouseEnabled()) {
    return Response.json(
      { error: "Sample-data mode: connect the warehouse (DATABASE_URL) to import reviews." },
      { status: 400 },
    );
  }

  let csv = "";
  try {
    const body = await request.json();
    csv = String(body.csv ?? "");
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const rows = parseCsv(csv);
  if (rows.length < 2) return Response.json({ error: "CSV needs a header row and at least one review" }, { status: 400 });
  if (rows.length - 1 > MAX_ROWS) return Response.json({ error: `Too many rows (max ${MAX_ROWS} per import)` }, { status: 400 });

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  const col = (name: string) => header.indexOf(name);
  const iChannel = col("channel"), iSku = Math.max(col("sku"), col("internal_sku")), iRating = col("rating"), iDate = col("date");
  const iTitle = col("title"), iBody = col("body"), iAuthor = col("author"), iVerified = col("verified"), iId = col("review_id");
  if (iChannel < 0 || iSku < 0 || iRating < 0 || iDate < 0) {
    return Response.json({ error: "Header must include: channel, sku, rating, date" }, { status: 400 });
  }

  const known = new Set((await q<{ sku: string }>(`SELECT internal_sku sku FROM sku_master`)).map((r) => r.sku));

  let inserted = 0, skipped = 0;
  const errors: string[] = [];
  for (let n = 1; n < rows.length; n++) {
    const r = rows[n];
    const channel = (r[iChannel] || "").trim().toLowerCase();
    const sku = (r[iSku] || "").trim();
    const rating = Math.round(Number(r[iRating]));
    const date = toIsoDate(r[iDate] || "");
    if (!CHANNELS.has(channel)) { skipped++; errors.length < 5 && errors.push(`row ${n + 1}: unknown channel "${r[iChannel]}"`); continue; }
    if (!known.has(sku)) { skipped++; errors.length < 5 && errors.push(`row ${n + 1}: unknown SKU "${sku}"`); continue; }
    if (!(rating >= 1 && rating <= 5)) { skipped++; errors.length < 5 && errors.push(`row ${n + 1}: rating must be 1–5`); continue; }
    if (!date) { skipped++; errors.length < 5 && errors.push(`row ${n + 1}: unreadable date "${r[iDate]}"`); continue; }

    const title = iTitle >= 0 ? (r[iTitle] || "").trim().slice(0, 300) : "";
    const body = iBody >= 0 ? (r[iBody] || "").trim().slice(0, 4000) : "";
    const author = iAuthor >= 0 ? (r[iAuthor] || "").trim().slice(0, 120) : "";
    const verified = iVerified >= 0 ? /^(true|yes|1|y)$/i.test((r[iVerified] || "").trim()) : false;
    const reviewId = iId >= 0 && (r[iId] || "").trim() ? (r[iId] || "").trim().slice(0, 120) : stableId([channel, sku, date, String(rating), title, author]);

    const res = await q<{ inserted: boolean }>(
      `INSERT INTO reviews (channel, review_id, internal_sku, review_date, rating, title, body, author, verified, source)
       VALUES ($1, $2, $3, $4::date, $5, nullif($6,''), nullif($7,''), nullif($8,''), $9, 'csv-import')
       ON CONFLICT (channel, review_id) DO NOTHING
       RETURNING true AS inserted`,
      [channel, reviewId, sku, date, rating, title, body, author, verified],
    );
    if (res.length) inserted++;
    else skipped++; // duplicate review_id — already imported
  }

  return Response.json({ ok: true, inserted, skipped, errors });
}
