import { NextRequest } from "next/server";
import { claudeAnswer } from "@/lib/data";

/**
 * Claude Insights endpoint.
 *
 * v1 returns an analysis grounded in the sample warehouse (the same numbers
 * the dashboard shows), including the SQL it would run.
 *
 * PRODUCTION seam: when ANTHROPIC_API_KEY is set, forward the question to the
 * Claude API with the "Zensil Ops" system prompt (schema + unit economics +
 * decision thresholds) and the read-only Postgres MCP connector, then return
 * Claude's narrative + evidence. Keep the read-only role so it can never mutate.
 */
export async function POST(request: NextRequest) {
  let question = "";
  try {
    const body = await request.json();
    question = String(body.question ?? "").slice(0, 2000);
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!question.trim()) {
    return Response.json({ error: "Empty question" }, { status: 400 });
  }

  // Simulate analyst latency for a natural feel; replace with the Claude call.
  await new Promise((r) => setTimeout(r, 600));

  const answer = claudeAnswer(question);
  return Response.json({ answer, grounded: true });
}
