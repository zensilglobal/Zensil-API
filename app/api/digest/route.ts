import { NextRequest } from "next/server";
import { Filter } from "@/lib/types";
import { anthropicReady, runDigest, buildFallbackDigest } from "@/lib/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly Business Review digest — designed to be called on a schedule
 * (n8n cron, Render cron, etc.) and the result emailed / posted.
 *
 * Returns { subject, html, text, model, generatedAt }. The `html` is a
 * ready-to-send branded email body; `text` is a plain-text fallback.
 *
 * Secured by a shared secret: set DIGEST_TOKEN in the environment and pass
 * it as `?token=` or the `x-digest-token` header. If DIGEST_TOKEN is unset
 * the endpoint stays closed (401) so it can't be scraped once deployed.
 */

const WINDOW: Filter = { channel: "all", days: 7 };

function authorized(request: NextRequest): boolean {
  const expected = process.env.DIGEST_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get("x-digest-token") ?? new URL(request.url).searchParams.get("token");
  return provided === expected;
}

function toText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\s*(h2|h3|p|li|br)[^>]*>/gi, "\n")
    .replace(/<\/(h2|h3|p|ul)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/&amp;/g, "&")
    .trim();
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const digest = anthropicReady() ? await runDigest(WINDOW) : await buildFallbackDigest(WINDOW);
    return Response.json({ ...digest, text: toText(digest.html), generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Digest error:", err);
    const fb = await buildFallbackDigest(WINDOW);
    return Response.json({ ...fb, text: toText(fb.html), generatedAt: new Date().toISOString() });
  }
}
