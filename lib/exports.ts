import { StockRow, WastedRow } from "./types";

/* =====================================================================
   ACTION ARTIFACTS
   Deterministic, executable exports built from the same warehouse data
   the dashboard shows. These are the "approve & execute" artifacts:
   an Amazon Ads negative-keyword bulk sheet and a restock / PO plan.
   Pure string builders — safe to call from server components.
   ===================================================================== */

const TARGET_COVER_DAYS = 45;

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

/** Units to reorder to reach TARGET_COVER_DAYS of cover at current velocity. */
export function reorderQty(velocity: number, onHand: number, targetDays = TARGET_COVER_DAYS): number {
  return Math.max(0, Math.ceil(velocity * targetDays - onHand));
}

/** Restock plan / purchase-order draft. */
export function restockCsv(rows: StockRow[]): string {
  const body = rows.map((r) => [
    r.sku,
    r.name,
    r.fba,
    r.easyShip,
    r.stock,
    r.velocity.toFixed(1),
    Math.round(r.cover),
    r.status,
    reorderQty(r.velocity, r.stock),
  ]);
  return toCsv(
    ["SKU", "Product", "FBA On Hand", "Easy Ship On Hand", "Total On Hand", "Velocity/Day", "Days Cover", "Status", `Reorder Qty (${TARGET_COVER_DAYS}d cover)`],
    body,
  );
}

/**
 * Amazon Ads negative-keyword bulk sheet. Columns mirror the Sponsored
 * Products bulk-operations layout the operator uploads in the Amazon Ads
 * console. Match type defaults to negative exact (safest for harvesting).
 */
export function negativesCsv(rows: WastedRow[]): string {
  const body = rows.map((w) => [
    "Sponsored Products",
    "Negative keyword",
    w.term,
    "negative exact",
    w.spend,
    w.clicks,
    w.orders,
    "Create",
  ]);
  return toCsv(
    ["Product", "Entity", "Keyword Text", "Match Type", "Spend (INR)", "Clicks", "Orders", "Operation"],
    body,
  );
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
