/**
 * Runs once when a Next.js server instance starts. The ETL scheduler is
 * Node-only, so it is dynamically imported — the edge (proxy) bundle must
 * never see node:child_process. Enabled only where ETL_INLINE=1 (Render).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ETL_INLINE !== "1") return;
  const { startEtlScheduler } = await import("./lib/etl-scheduler");
  startEtlScheduler();
}
