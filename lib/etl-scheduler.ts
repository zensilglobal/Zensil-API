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

export function startEtlScheduler() {
  console.log("[etl] inline scheduler enabled — orders every 10 min, reports every 30 min");
  // First syncs shortly after boot (fresh data right after every deploy),
  // staggered so the two lanes never compete for SP-API rate limits.
  setTimeout(syncOrders, 15_000);
  setTimeout(syncReports, 90_000);
  setInterval(syncOrders, 10 * 60_000);
  setInterval(syncReports, 30 * 60_000);
}
