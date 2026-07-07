import { NextRequest } from "next/server";
import { claudeAnswer } from "@/lib/data";
import { ChannelFilter, Filter, RangeDays } from "@/lib/types";
import { anthropicReady, runInsight } from "@/lib/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Claude Insights endpoint — "Run by Claude".
 *
 * With ANTHROPIC_API_KEY set, the question is answered by Claude Opus 4.8,
 * grounded on a live snapshot of the warehouse for the selected channel +
 * window (see lib/insights.ts). Without a key — or on any API error — it
 * degrades to the built-in sample analyst so the feature always runs.
 */

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

  const sample = () => Response.json({ answer: claudeAnswer(question), grounded: true, model: "sample" });

  if (!anthropicReady()) return sample();

  try {
    const { html, model } = await runInsight(question, filter);
    if (!html) return sample();
    return Response.json({ answer: html, grounded: true, model });
  } catch (err) {
    console.error("Claude Insights error:", err);
    return sample();
  }
}
