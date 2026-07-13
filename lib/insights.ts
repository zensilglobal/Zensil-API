import "server-only";
import { GoogleGenAI } from "@google/genai";
import {
  getStockHealth,
  getCampaigns,
  getWasted,
  getProducts,
  getReturns,
  getOverviewKpis,
  adChannelAvailable,
} from "./queries";
import { Filter } from "./types";

/* =====================================================================
   INSIGHTS ENGINE
   Shared grounding + Gemini plumbing for the two AI surfaces:
   the interactive /api/claude endpoint and the /api/digest weekly review.
   Both ground on the same warehouse snapshot and degrade gracefully.
   ===================================================================== */

// gemini-2.5-flash: best model with free-tier quota (2.5-pro is paid-tier only)
export const INSIGHTS_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export function geminiReady(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export const ANALYST_SYSTEM = `You are the analyst inside Zensil Ops Console — the command centre for Zensil, an Indian premium D2C brand selling across Amazon, Flipkart and Shopify. You answer the operator's questions over their live warehouse.

GROUNDING
- Every request includes a JSON snapshot of the warehouse for the selected channel and time window. Ground every figure and SKU in that snapshot. Never invent products, numbers, or campaigns that are not present.
- If the snapshot lacks what is needed to answer, say so plainly and state what data would be required.

UNIT ECONOMICS & THRESHOLDS
- All money is Indian Rupees (₹), Indian digit grouping (e.g. ₹1,20,000).
- Days of cover = on-hand ÷ daily velocity. < 7 days = critical, < 14 = low, else healthy.
- Advertising is Amazon-only. Target ACOS is 28%; above 50% is a red flag. "Wasted spend" = search terms over ₹500 spend with zero / near-zero orders.
- Contribution margin = (price − cost) ÷ price.

OUTPUT — return a single compact HTML fragment and nothing else.
- No markdown, no code fences, no <html>/<head>/<body> wrappers.
- Allowed tags only: <p>, <b>, <i>, <ul>, <li>, <code>, and <div class="sql"> for one short illustrative SQL query.
- Structure: open with a one-sentence direct answer in <p>, then an evidence <ul> of the specific SKUs/terms/numbers, then a bolded recommendation quantified in ₹ or days, then close with a short <i> line noting the operator approves & executes the action.
- Be decisive and specific. Lead with the outcome. No preamble like "Based on the data".`;

const DIGEST_SYSTEM = `You are writing the Monday-morning Weekly Business Review email for the founder of Zensil, an Indian premium D2C brand selling across Amazon, Flipkart and Shopify. You are given a JSON snapshot of the last 7 days of the warehouse.

Ground every figure and SKU in the snapshot — never invent data. Money is Indian Rupees (₹) with Indian digit grouping. Stockout thresholds: < 7 days cover = critical, < 14 = low. Amazon ACOS target is 28%; > 50% is a red flag.

OUTPUT — return a single HTML fragment for an email body and nothing else. No markdown, no code fences, no <html>/<head>/<body>. Use only <h2>, <h3>, <p>, <ul>, <li>, <b>.
Structure exactly:
1. <p> — a two-sentence TL;DR of how the week went.
2. <h3>The numbers</h3> then a <ul> of the headline KPIs with their week-over-week move.
3. <h3>Wins</h3> then a <ul> of up to 3 concrete wins.
4. <h3>Risks &amp; actions</h3> then a <ul> where each item states the risk <b>and</b> the specific action to take, quantified in ₹ or units.
5. <h3>This week's priority</h3> then one <p> with a single <b>bolded</b> most-important action.
Be specific and decisive. No preamble.`;

export async function buildSnapshot(f: Filter) {
  const [kpis, stock, products, returns] = await Promise.all([
    getOverviewKpis(f),
    getStockHealth(f),
    getProducts(),
    getReturns(f),
  ]);
  const ads = adChannelAvailable(f);
  const [campaigns, wasted] = ads ? await Promise.all([getCampaigns(), getWasted()]) : [[], []];

  return {
    channel: f.channel,
    window_days: f.days,
    headline_kpis: kpis.map((k) => ({
      label: k.label,
      value: stripTags(k.value),
      delta_pct: k.deltaPct == null ? null : Number(k.deltaPct.toFixed(1)),
    })),
    stock_health: stock.slice(0, 10).map((s) => ({
      sku: s.sku,
      name: s.name,
      on_hand: s.stock,
      velocity_per_day: Number(s.velocity.toFixed(1)),
      days_of_cover: Math.round(s.cover),
      status: s.status,
    })),
    products: products.map((p) => ({
      sku: p.sku,
      name: p.name,
      velocity: { amazon: p.amazonVel, flipkart: p.flipkartVel, shopify: p.shopifyVel },
      margin_pct: Math.round(p.marginPct),
      total_stock: p.totalStock,
      best_channel: p.bestChannel,
    })),
    returns: returns.slice(0, 6).map((r) => ({
      sku: r.sku,
      name: r.name,
      return_rate_pct: Number(r.rate.toFixed(1)),
      units: r.units,
      top_reason: r.reason,
    })),
    advertising: ads
      ? {
          campaigns: campaigns.map((c) => ({ name: c.name, spend: c.spend, sales: c.sales, acos: c.acos, orders: c.orders })),
          wasted_spend: wasted.map((w) => ({ term: w.term, spend: w.spend, clicks: w.clicks, orders: w.orders })),
        }
      : "Advertising data is Amazon-only; not available for this channel filter.",
  };
}

type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>;

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

// Defence-in-depth before dangerouslySetInnerHTML / email delivery.
export function sanitize(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

// Gemini sometimes wraps HTML output in ```html fences despite instructions.
function unfence(s: string): string {
  return s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
}

/** One grounded Gemini call. Throws on API error (callers fall back). */
async function generate(system: string, prompt: string): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  // "AQ." keys are Vertex AI express-mode keys; "AIza" keys are AI Studio keys.
  const ai = new GoogleGenAI({ apiKey, vertexai: apiKey?.startsWith("AQ.") });
  const response = await ai.models.generateContent({
    model: INSIGHTS_MODEL,
    contents: prompt,
    config: {
      systemInstruction: system,
      // Gemini 2.5 thinking tokens count against this cap — keep it roomy.
      maxOutputTokens: 8192,
      temperature: 0.3,
    },
  });
  return { text: sanitize(unfence(response.text ?? "")), model: response.modelVersion ?? INSIGHTS_MODEL };
}

/** Interactive Q&A — grounded HTML fragment. Throws on API error (caller falls back). */
export async function runInsight(question: string, f: Filter): Promise<{ html: string; model: string }> {
  const snapshot = await buildSnapshot(f);
  const { text, model } = await generate(
    ANALYST_SYSTEM,
    `Question: ${question}\n\nWarehouse snapshot (JSON):\n${JSON.stringify(snapshot)}`,
  );
  return { html: text, model };
}

/* ----------------------------- WEEKLY DIGEST ----------------------------- */

function digestSubject(): string {
  const d = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  return `Zensil Weekly Review — ${d}`;
}

/** Brand email shell around a body fragment. Inline + <style> for broad client support. */
function emailShell(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
  body{margin:0;background:#08080a;color:#f3efe6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
  .wrap{max-width:640px;margin:0 auto;padding:28px 22px 40px;}
  .crest{font-size:20px;font-weight:800;letter-spacing:1px;background:linear-gradient(92deg,#fff,#e8cf86 70%,#d4af37);-webkit-background-clip:text;background-clip:text;color:transparent;}
  .kicker{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#9a7b1e;font-weight:700;margin-top:2px;}
  .card{margin-top:20px;padding:22px;border-radius:16px;background:linear-gradient(180deg,#16161b,#0e0e12);border:1px solid rgba(212,175,55,.16);}
  h2{font-size:19px;margin:0 0 6px;}
  h3{font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#d4af37;margin:20px 0 8px;}
  p{font-size:14px;line-height:1.6;color:#cfc9bf;margin:0 0 10px;}
  ul{margin:0;padding-left:18px;} li{font-size:14px;line-height:1.6;color:#cfc9bf;margin:6px 0;}
  b{color:#f3efe6;}
  .foot{margin-top:22px;font-size:11px;color:#6f6a62;text-align:center;}
</style></head>
<body><div class="wrap">
  <div class="crest">ZENSIL</div><div class="kicker">Weekly Business Review</div>
  <div class="card"><h2>${digestSubject()}</h2>${bodyHtml}</div>
  <div class="foot">Generated by Zensil Ops Console · figures from your live warehouse</div>
</div></body></html>`;
}

/** Gemini-written weekly review. Throws on API error (caller falls back). */
export async function runDigest(f: Filter): Promise<{ subject: string; html: string; model: string }> {
  const snapshot = await buildSnapshot(f);
  const { text, model } = await generate(
    DIGEST_SYSTEM,
    `Produce this week's review. Warehouse snapshot (JSON):\n${JSON.stringify(snapshot)}`,
  );
  return { subject: digestSubject(), html: emailShell(text), model };
}

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Deterministic digest from the snapshot — used when no GEMINI_API_KEY is set. */
export async function buildFallbackDigest(f: Filter): Promise<{ subject: string; html: string; model: string }> {
  const s: Snapshot = await buildSnapshot(f);
  const critical = s.stock_health.filter((r) => r.status === "critical");
  const low = s.stock_health.filter((r) => r.status === "low");
  const wasted = typeof s.advertising === "object" ? s.advertising.wasted_spend.filter((w) => w.orders === 0) : [];
  const wastedTotal = wasted.reduce((a, w) => a + w.spend, 0);
  const worstReturn = s.returns[0];

  const kpis = s.headline_kpis
    .map((k) => `<li><b>${k.label}:</b> ${k.value}${k.delta_pct != null ? ` (${k.delta_pct > 0 ? "+" : ""}${k.delta_pct}% vs prior week)` : ""}</li>`)
    .join("");

  const risks: string[] = [];
  if (critical.length)
    risks.push(
      `<li><b>${critical.length} SKU${critical.length > 1 ? "s" : ""} critically low</b> — ${critical
        .slice(0, 3)
        .map((r) => `${r.name} (${r.days_of_cover}d)`)
        .join(", ")}. Reorder now before stockout.</li>`,
    );
  if (wasted.length) risks.push(`<li><b>${inr(wastedTotal)} wasted ad spend</b> across ${wasted.length} zero-order search terms — add them as negative keywords.</li>`);
  if (worstReturn) risks.push(`<li><b>${worstReturn.name} returning at ${worstReturn.return_rate_pct}%</b> — top reason "${worstReturn.top_reason}". Review before scaling.</li>`);

  const wins: string[] = [];
  const growth = s.headline_kpis.find((k) => k.delta_pct != null && k.delta_pct > 0);
  if (growth) wins.push(`<li>${growth.label} up ${growth.delta_pct}% week over week (${growth.value}).</li>`);
  const bestMargin = [...s.products].sort((a, b) => b.margin_pct - a.margin_pct)[0];
  if (bestMargin) wins.push(`<li>Best-margin line is <b>${bestMargin.name}</b> at ${bestMargin.margin_pct}% — strongest on ${bestMargin.best_channel}.</li>`);
  const healthy = s.stock_health.filter((r) => r.status === "healthy").length;
  if (healthy) wins.push(`<li>${healthy} SKU${healthy === 1 ? "" : "s"} remain healthily stocked.</li>`);

  const priority = critical.length
    ? `Reorder the ${critical.length} critical SKU${critical.length > 1 ? "s" : ""} today`
    : wasted.length
      ? `Add ${wasted.length} negative keywords to reclaim ${inr(wastedTotal)}/period`
      : `Push inventory toward your best-margin channel`;

  const body =
    `<p>Here is your week across Amazon, Flipkart and Shopify, straight from the warehouse.</p>` +
    `<h3>The numbers</h3><ul>${kpis}</ul>` +
    `<h3>Wins</h3><ul>${wins.join("") || "<li>Steady week — no standout movers.</li>"}</ul>` +
    `<h3>Risks &amp; actions</h3><ul>${risks.join("") || "<li>No critical risks flagged this week.</li>"}</ul>` +
    `<h3>This week's priority</h3><p><b>${priority}.</b></p>`;

  return { subject: digestSubject(), html: emailShell(body), model: "sample" };
}
