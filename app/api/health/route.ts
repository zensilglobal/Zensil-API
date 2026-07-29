import { q1, warehouseEnabled } from "@/lib/db";

/*
  Render's health check hits this, so it reports whether *this process* can
  serve — not whether its dependencies are happy. It used to 503 on any
  warehouse error, which meant a Neon outage failed the health check, the
  deploy timed out, and the whole dashboard went unreachable over a problem
  that no redeploy could fix. Liveness and warehouse reachability are now
  separate: the status code tracks the app, and `db` reports the warehouse
  so monitoring still sees the outage.
*/
export const dynamic = "force-dynamic";

export async function GET() {
  if (!warehouseEnabled()) {
    return Response.json({ ok: true, db: "sample" });
  }
  try {
    await q1("SELECT 1");
    return Response.json({ ok: true, db: "ok" });
  } catch (err) {
    return Response.json({
      ok: true,
      db: "error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
