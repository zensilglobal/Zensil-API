import { spawn } from "node:child_process";

/**
 * In-process ETL scheduler (loaded only on the Node.js runtime, see
 * instrumentation.ts). External schedulers proved unreliable — GitHub Actions
 * cron skipped ~95% of fires and Render cron stalled after one run — so the
 * always-on web service syncs the warehouse itself: the Docker image bundles
 * Python + the etl package, and this module spawns it on a timer.
 */
const running = new Set<string>();

function runEtl(label: string, only: string, extraEnv: Record<string, string> = {}) {
  if (running.has(label)) {
    console.log(`[etl:${label}] previous run still active — skipping this tick`);
    return;
  }
  running.add(label);
  const child = spawn(process.env.ETL_PYTHON || "python3", ["-m", "etl.run_all", "--only", only], {
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d: Buffer) => process.stdout.write(`[etl:${label}] ${d}`));
  child.stderr.on("data", (d: Buffer) => process.stdout.write(`[etl:${label}] ${d}`));
  child.on("error", (err) => {
    running.delete(label);
    console.error(`[etl:${label}] failed to start:`, err);
  });
  child.on("exit", (code) => {
    running.delete(label);
    console.log(`[etl:${label}] exited with code ${code}`);
  });
}

const syncOrders = () => runEtl("orders", "amazon_orders", { AMAZON_ORDERS_LOOKBACK_DAYS: "1" });
const syncReports = () => runEtl("reports", "amazon_inventory,amazon_returns");

/*
  Sync intervals are set by Neon's compute budget, not by how fresh we would
  like the data to be. Neon auto-suspends its compute after ~5 minutes idle
  and bills for the time it is awake, so a sync every 10 minutes never let it
  sleep for long and burned the monthly compute quota in about a week — which
  took the warehouse offline entirely. Anything below a ~10 minute gap keeps
  the compute pinned awake; these intervals leave it suspended most of the
  hour. Raise the cadence only alongside a paid Neon plan.
*/
const ORDERS_EVERY = 30 * 60_000;
const REPORTS_EVERY = 3 * 60 * 60_000;

export function startEtlScheduler() {
  console.log("[etl] inline scheduler enabled — orders every 30 min, reports every 3 h");
  // First syncs shortly after boot (fresh data right after every deploy),
  // staggered so the two lanes never compete for SP-API rate limits.
  setTimeout(syncOrders, 15_000);
  setTimeout(syncReports, 90_000);
  setInterval(syncOrders, ORDERS_EVERY);
  setInterval(syncReports, REPORTS_EVERY);
}
