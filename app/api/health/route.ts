import { q1, warehouseEnabled } from "@/lib/db";

// Render's health check hits this: 200 only when the app AND its warehouse
// connection are good, so a bad DATABASE_URL fails the deploy instead of
// going live broken. Sample-data mode (no DATABASE_URL) is a healthy state.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!warehouseEnabled()) {
    return Response.json({ ok: true, db: "sample" });
  }
  try {
    await q1("SELECT 1");
    return Response.json({ ok: true, db: "ok" });
  } catch (err) {
    return Response.json(
      { ok: false, db: "error", detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
