import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getStockHealth,
  getCampaigns,
  getWasted,
  getProducts,
  getReturns,
  getOverviewKpis,
  adChannelAvailable,
} from "@/lib/queries";
import { claudeAnswer } from "@/lib/data";
import { ChannelFilter, Filter, RangeDays } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Claude Insights endpoint — "Run by Claude".
 *
 * When ANTHROPIC_API_KEY is set, the question is answered by Claude Opus 4.8,
 * grounded on a live snapshot of the warehouse (the same numbers the dashboard
 * shows) for the currently-selected channel + window. The model returns a
 * compact HTML fragment that renders with the dashboard's own styles.
 *
 * When no key is present it falls back to the built-in sample analyst so the
 * feature always runs. Any API error also degrades to the sample answer rather
 * than surfacing an error to the operator.
 */

const MODEL = "claude-opus-4-8";

const SYSTEM = `You are the analyst inside Zensil Ops Console — the command centre for Zensil, an Indian premium D2C brand selling across Amazon, Flipkart and Shopify. You answer the operator's questions over their live warehouse.

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

function parseBody(body: Record<string, unknown>): { question: string; filter: Filter } {
  const question = String(body.question ?? "").slice(0, 2000);
  const channelRaw = String(body.channel ?? "all");
  const channel: ChannelFilter = (["all", "amazon", "flipkart", "shopify"] as const).includes(
    channelRaw as ChannelFilter,
  )
    ? (channelRaw as ChannelFilter)
    : "all";
  const daysRaw = Number(body.days);
  const days: RangeDays = ([7, 30, 90] as const).includes(daysRaw as RangeDays) ? (daysRaw as RangeDays) : 30;
  return { question, filter: { channel, days } };
}

async function buildSnapshot(f: Filter) {
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
    headline_kpis: kpis.map((k) => ({ label: k.label, value: k.value, delta_pct: k.deltaPct })),
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

// Defence-in-depth: the model is instructed to emit a tag whitelist, but strip
// anything script-like before it reaches dangerouslySetInnerHTML.
function sanitize(html: string): string {
  return html
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

export async function POST(request: NextRequest) {
  let question = "";
  let filter: Filter = { channel: "all", days: 30 };
  try {
    const body = await request.json();
    ({ question, filter } = parseBody(body));
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!question.trim()) {
    return Response.json({ error: "Empty question" }, { status: 400 });
  }

  // No key → deterministic sample analyst (still grounded in the sample data).
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ answer: claudeAnswer(question), grounded: true, model: "sample" });
  }

  try {
    const snapshot = await buildSnapshot(filter);
    const client = new Anthropic();
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Question: ${question}\n\nWarehouse snapshot (JSON):\n${JSON.stringify(snapshot)}`,
        },
      ],
    });

    const answer = sanitize(
      message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
    );

    if (!answer) {
      return Response.json({ answer: claudeAnswer(question), grounded: true, model: "sample" });
    }
    return Response.json({ answer, grounded: true, model: message.model });
  } catch (err) {
    console.error("Claude Insights error:", err);
    // Degrade gracefully rather than showing the operator an error.
    return Response.json({ answer: claudeAnswer(question), grounded: true, model: "sample" });
  }
}
