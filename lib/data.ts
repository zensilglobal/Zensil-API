import "server-only";
import {
  Channel,
  ChannelFilter,
  Filter,
  OrderRow,
  SkuRevenueRow,
  OrderLineRow,
  StockRow,
  CampaignRow,
  WastedRow,
  ReturnRow,
  ReturnReason,
  TopProduct,
  ProductRow,
  Decision,
  TrendPoint,
  ChannelSplit,
  Kpi,
} from "./types";
import { inr, inrK, num, pct, deltaPct, channelName } from "./format";
import { buildQuery } from "./filter";

/* =====================================================================
   DATA LAYER
   Computes from a deterministic in-memory sample warehouse so the
   dashboard is fully functional with zero credentials. lib/queries.ts is
   the seam: when DATABASE_URL is set it routes to the live Neon queries
   in lib/warehouse.ts instead; the shapes returned here match those.
   ===================================================================== */

const BASE = new Date("2026-06-29T00:00:00Z");

interface Product {
  sku: string;
  name: string;
  cost: number;
  azVel: number;
  fkVel: number;
  shVel: number;
  azStock: number;
  fkStock: number;
  shStock: number;
  azPrice: number;
  fkPrice: number;
  shPrice: number;
}

const products: Product[] = [
  { sku: "ZN-AROMA-01", name: "Zensil Amber Oud Diffuser", cost: 540, azVel: 11.4, fkVel: 6.2, shVel: 4.1, azStock: 120, fkStock: 64, shStock: 38, azPrice: 1499, fkPrice: 1399, shPrice: 1599 },
  { sku: "ZN-SILK-22", name: "Imperial Silk Scarf — Crimson", cost: 820, azVel: 7.8, fkVel: 9.1, shVel: 3.4, azStock: 34, fkStock: 18, shStock: 22, azPrice: 2299, fkPrice: 2149, shPrice: 2399 },
  { sku: "ZN-CANDLE-07", name: "Gilded Soy Candle Trio", cost: 310, azVel: 14.2, fkVel: 5.4, shVel: 6.8, azStock: 9, fkStock: 41, shStock: 30, azPrice: 899, fkPrice: 849, shPrice: 949 },
  { sku: "ZN-TEA-15", name: "Royal Assam Gold Tin", cost: 260, azVel: 9.6, fkVel: 12.8, shVel: 5.2, azStock: 210, fkStock: 88, shStock: 120, azPrice: 749, fkPrice: 699, shPrice: 799 },
  { sku: "ZN-LEATHER-09", name: "Obsidian Leather Journal", cost: 430, azVel: 5.1, fkVel: 3.2, shVel: 4.6, azStock: 6, fkStock: 12, shStock: 8, azPrice: 1199, fkPrice: 1149, shPrice: 1299 },
  { sku: "ZN-BRASS-31", name: "Heritage Brass Incense Stand", cost: 380, azVel: 4.4, fkVel: 7.7, shVel: 2.1, azStock: 58, fkStock: 5, shStock: 44, azPrice: 999, fkPrice: 949, shPrice: 1049 },
  { sku: "ZN-GLOW-44", name: "24K Glow Face Serum", cost: 290, azVel: 18.9, fkVel: 8.3, shVel: 9.7, azStock: 74, fkStock: 140, shStock: 95, azPrice: 1099, fkPrice: 999, shPrice: 1149 },
  { sku: "ZN-VELVET-12", name: "Velvet Cushion — Emerald", cost: 610, azVel: 3.6, fkVel: 6.9, shVel: 2.8, azStock: 90, fkStock: 31, shStock: 17, azPrice: 1799, fkPrice: 1699, shPrice: 1899 },
];

const campaigns: CampaignRow[] = [
  { name: "SP — Amber Oud Exact", spend: 18400, sales: 71200, acos: 25.8, clicks: 2140, orders: 62 },
  { name: "SP — Gold Serum Auto", spend: 22600, sales: 54300, acos: 41.6, clicks: 3010, orders: 48 },
  { name: "SB — Brand Defense", spend: 9800, sales: 48900, acos: 20.0, clicks: 1180, orders: 39 },
  { name: "SP — Candle Trio Broad", spend: 14300, sales: 24100, acos: 59.3, clicks: 2620, orders: 19 },
  { name: "SD — Retargeting", spend: 7600, sales: 31200, acos: 24.4, clicks: 940, orders: 27 },
  { name: "SP — Silk Scarf Phrase", spend: 11200, sales: 39800, acos: 28.1, clicks: 1490, orders: 31 },
];

const wasted: WastedRow[] = [
  { term: "cheap diffuser online", spend: 2840, clicks: 412, orders: 0 },
  { term: "candle gift set under 500", spend: 1960, clicks: 301, orders: 0 },
  { term: "serum for oily skin", spend: 1610, clicks: 248, orders: 1 },
  { term: "brass pooja items", spend: 1240, clicks: 190, orders: 0 },
  { term: "silk dupatta", spend: 980, clicks: 154, orders: 0 },
  { term: "journal notebook a5", spend: 760, clicks: 121, orders: 1 },
];

const returnReasons: ReturnReason[] = [
  { reason: "Damaged in transit", share: 34, color: "#c22222" },
  { reason: "Not as described", share: 24, color: "#d4af37" },
  { reason: "Quality issue", share: 19, color: "#1f7a4d" },
  { reason: "Wrong item", share: 13, color: "#3f8fe0" },
  { reason: "Changed mind", share: 10, color: "#7a7a82" },
];

const regions = ["Maharashtra", "Karnataka", "Delhi NCR", "Tamil Nadu", "Gujarat", "West Bengal", "Telangana", "UP"];

function priceFor(p: Product, ch: Channel): number {
  return ch === "amazon" ? p.azPrice : ch === "flipkart" ? p.fkPrice : p.shPrice;
}
function velFor(p: Product, ch: Channel): number {
  return ch === "amazon" ? p.azVel : ch === "flipkart" ? p.fkVel : p.shVel;
}
function stockFor(p: Product, ch: Channel): number {
  return ch === "amazon" ? p.azStock : ch === "flipkart" ? p.fkStock : p.shStock;
}

// deterministic order history (90 days), generated once.
const ALL_ORDERS: OrderRow[] = (() => {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out: OrderRow[] = [];
  let id = 80450;
  for (let d = 0; d < 90; d++) {
    const date = new Date(BASE);
    date.setUTCDate(BASE.getUTCDate() - d);
    const perDay = 7 + Math.floor(rnd() * 8);
    for (let k = 0; k < perDay; k++) {
      const r = rnd();
      const ch: Channel = r < 0.42 ? "amazon" : r < 0.74 ? "flipkart" : "shopify";
      const p = products[Math.floor(rnd() * products.length)];
      const qty = 1 + Math.floor(rnd() * 3);
      const price = priceFor(p, ch);
      const st = rnd() < 0.62 ? "delivered" : rnd() < 0.5 ? "transit" : rnd() < 0.55 ? "pending" : "returned";
      out.push({
        id: "#" + id++,
        channel: ch,
        date: date.toISOString(),
        sku: p.sku,
        name: p.name,
        qty,
        value: price * qty,
        region: regions[Math.floor(rnd() * regions.length)],
        status: st as OrderRow["status"],
      });
    }
  }
  return out;
})();

function inChannel(o: OrderRow, ch: ChannelFilter): boolean {
  return ch === "all" || o.channel === ch;
}
function windowOrders(f: Filter): OrderRow[] {
  const cutoff = new Date(BASE);
  cutoff.setUTCDate(BASE.getUTCDate() - f.days);
  return ALL_ORDERS.filter((o) => new Date(o.date) >= cutoff && inChannel(o, f.channel));
}
function prevWindowOrders(f: Filter): OrderRow[] {
  const end = new Date(BASE);
  end.setUTCDate(BASE.getUTCDate() - f.days);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - f.days);
  return ALL_ORDERS.filter((o) => {
    const dt = new Date(o.date);
    return dt >= start && dt < end && inChannel(o, f.channel);
  });
}
const sum = (arr: OrderRow[], fn: (o: OrderRow) => number) => arr.reduce((a, b) => a + fn(b), 0);

function splitOf(orders: OrderRow[]): ChannelSplit {
  return {
    amazon: sum(orders.filter((o) => o.channel === "amazon"), (o) => o.value),
    flipkart: sum(orders.filter((o) => o.channel === "flipkart"), (o) => o.value),
    shopify: sum(orders.filter((o) => o.channel === "shopify"), (o) => o.value),
  };
}
function splitHtml(orders: OrderRow[]): string {
  const s = splitOf(orders);
  const t = s.amazon + s.flipkart + s.shopify || 1;
  return `<b style="color:var(--color-amazon)">A ${Math.round((s.amazon / t) * 100)}%</b> · <b style="color:var(--color-flipkart)">F ${Math.round((s.flipkart / t) * 100)}%</b> · <b style="color:var(--color-shopify)">S ${Math.round((s.shopify / t) * 100)}%</b>`;
}

/* ---------- stable per-string rng for returns ---------- */
function rndStable(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return (h % 1000) / 1000;
}

/* ===================== PUBLIC QUERY API ===================== */

export function getOverviewKpis(f: Filter): Kpi[] {
  const cur = windowOrders(f);
  const prev = prevWindowOrders(f);
  const rev = sum(cur, (o) => o.value);
  const prevRev = sum(prev, (o) => o.value);
  const aov = cur.length ? rev / cur.length : 0;
  const prevAov = prev.length ? prevRev / prev.length : 0;
  const adSpend = campaigns.reduce((a, c) => a + c.spend, 0);
  const adSales = campaigns.reduce((a, c) => a + c.sales, 0);
  const acos = adSales ? (adSpend / adSales) * 100 : 0;
  const qs = buildQuery(f);
  return [
    { label: "Net Revenue", value: inrK(rev), deltaPct: deltaPct(rev, prevRev), splitHtml: splitHtml(cur), href: `/drilldown/revenue${qs}` },
    { label: "Orders", value: num(cur.length), deltaPct: deltaPct(cur.length, prev.length), splitHtml: splitHtml(cur), href: `/drilldown/orders${qs}` },
    { label: "Avg Order Value", value: inr(aov), deltaPct: deltaPct(aov, prevAov), sub: "per order", href: `/drilldown/aov${qs}` },
    { label: "Blended ACOS", value: pct(acos), deltaPct: -3.2, sub: "Amazon ads", href: `/drilldown/acos${qs}` },
  ];
}

export function getRevenueBySku(f: Filter): SkuRevenueRow[] {
  const cur = windowOrders(f);
  const by = new Map<string, SkuRevenueRow>();
  cur.forEach((o) => {
    const key = o.sku + "|" + o.channel;
    const row = by.get(key) || { sku: o.sku, name: o.name, channel: o.channel, units: 0, orders: 0, avgPrice: 0, revenue: 0 };
    row.units += o.qty;
    row.orders += 1;
    row.revenue += o.value;
    by.set(key, row);
  });
  return [...by.values()]
    .map((r) => ({ ...r, avgPrice: r.units ? r.revenue / r.units : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function getOrderLines(f: Filter): OrderLineRow[] {
  // sample orders carry one SKU each, so one line per order.
  return windowOrders(f)
    .map((o) => ({
      id: o.id, channel: o.channel, date: o.date, sku: o.sku, name: o.name,
      qty: o.qty, price: o.qty ? o.value / o.qty : 0, value: o.value, region: o.region, status: o.status,
    }))
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

export function getTrend(f: Filter): TrendPoint[] {
  const step = f.days > 30 ? 3 : 1;
  const points: TrendPoint[] = [];
  for (let d = f.days - 1; d >= 0; d -= step) {
    const dt = new Date(BASE);
    dt.setUTCDate(BASE.getUTCDate() - d);
    const lo = new Date(dt);
    const hi = new Date(dt);
    hi.setUTCDate(dt.getUTCDate() + step);
    const slice = ALL_ORDERS.filter((o) => {
      const od = new Date(o.date);
      return od >= lo && od < hi;
    });
    points.push({
      label: dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }),
      amazon: sum(slice.filter((o) => o.channel === "amazon"), (o) => o.value),
      flipkart: sum(slice.filter((o) => o.channel === "flipkart"), (o) => o.value),
      shopify: sum(slice.filter((o) => o.channel === "shopify"), (o) => o.value),
    });
  }
  return points;
}

export function getChannelSplit(f: Filter): ChannelSplit {
  return splitOf(windowOrders(f));
}

export function getTopProducts(f: Filter, limit = 5): TopProduct[] {
  const cur = windowOrders(f);
  const by: Record<string, { value: number; units: number }> = {};
  cur.forEach((o) => {
    const t = (by[o.name] ||= { value: 0, units: 0 });
    t.value += o.value;
    t.units += o.qty;
  });
  return Object.entries(by)
    .map(([name, t]) => ({ name, value: t.value, units: t.units, avgPrice: t.units ? t.value / t.units : 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function getSalesKpis(f: Filter): Kpi[] {
  const cur = windowOrders(f);
  const prev = prevWindowOrders(f);
  const rev = sum(cur, (o) => o.value);
  const prevRev = sum(prev, (o) => o.value);
  const units = sum(cur, (o) => o.qty);
  const prevUnits = sum(prev, (o) => o.qty);
  const aov = cur.length ? rev / cur.length : 0;
  const prevAov = prev.length ? prevRev / prev.length : 0;
  const qs = buildQuery(f);
  return [
    { label: "Revenue", value: inrK(rev), deltaPct: deltaPct(rev, prevRev), splitHtml: splitHtml(cur), href: `/drilldown/revenue${qs}` },
    { label: "Orders", value: num(cur.length), deltaPct: deltaPct(cur.length, prev.length), splitHtml: splitHtml(cur), href: `/drilldown/orders${qs}` },
    { label: "Units Sold", value: num(units), deltaPct: deltaPct(units, prevUnits), sub: "items", href: `/drilldown/revenue${qs}` },
    { label: "Avg Order Value", value: inr(aov), deltaPct: deltaPct(aov, prevAov), sub: "per order", href: `/drilldown/aov${qs}` },
  ];
}

export function getOrdersPerDay(f: Filter): TrendPoint[] {
  const days = Math.min(f.days, 30);
  const points: TrendPoint[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const dt = new Date(BASE);
    dt.setUTCDate(BASE.getUTCDate() - d);
    const dayKey = dt.toDateString();
    const slice = ALL_ORDERS.filter((o) => new Date(o.date).toDateString() === dayKey);
    points.push({
      label: dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }),
      amazon: slice.filter((o) => o.channel === "amazon").length,
      flipkart: slice.filter((o) => o.channel === "flipkart").length,
      shopify: slice.filter((o) => o.channel === "shopify").length,
    });
  }
  return points;
}

export function getRecentOrders(f: Filter, limit = 12): { rows: OrderRow[]; total: number } {
  const cur = windowOrders(f);
  const rows = [...cur].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, limit);
  return { rows, total: cur.length };
}

export function getStockHealth(f: Filter): StockRow[] {
  return products
    .map((p) => {
      // sample mode: Amazon stock is FBA; Flipkart/Shopify stock is seller-fulfilled
      let stock: number, velocity: number, fba: number;
      if (f.channel === "all") {
        stock = p.azStock + p.fkStock + p.shStock;
        velocity = p.azVel + p.fkVel + p.shVel;
        fba = p.azStock;
      } else {
        stock = stockFor(p, f.channel);
        velocity = velFor(p, f.channel);
        fba = f.channel === "amazon" ? p.azStock : 0;
      }
      const cover = velocity ? stock / velocity : 999;
      const status: StockRow["status"] = cover < 7 ? "critical" : cover < 14 ? "low" : "healthy";
      return { sku: p.sku, name: p.name, stock, fba, easyShip: stock - fba, velocity, cover, status };
    })
    .sort((a, b) => a.cover - b.cover);
}

export function getInventoryKpis(f: Filter): Kpi[] {
  const rows = getStockHealth(f);
  const crit = rows.filter((r) => r.status === "critical").length;
  const low = rows.filter((r) => r.status === "low").length;
  const totalUnits = rows.reduce((a, r) => a + r.stock, 0);
  return [
    { label: "SKUs Tracked", value: num(rows.length), sub: "live snapshot" },
    { label: "Critical", value: `<span style="color:var(--color-crimson-bright)">${crit}</span>`, sub: "< 7 days cover" },
    { label: "Low Stock", value: `<span style="color:var(--color-gold-soft)">${low}</span>`, sub: "< 14 days cover" },
    { label: "Units On Hand", value: num(totalUnits), sub: "total inventory" },
  ];
}

export const adChannelAvailable = (f: Filter) => f.channel !== "flipkart" && f.channel !== "shopify";

export function getAdvertisingKpis(): Kpi[] {
  const spend = campaigns.reduce((a, c) => a + c.spend, 0);
  const sales = campaigns.reduce((a, c) => a + c.sales, 0);
  const acos = (spend / sales) * 100;
  const waste = wasted.filter((w) => w.orders === 0).reduce((a, w) => a + w.spend, 0);
  return [
    { label: "Ad Spend", value: inrK(spend), deltaPct: 8.4, sub: "Amazon" },
    { label: "Ad Sales", value: inrK(sales), deltaPct: 12.1, sub: "attributed" },
    { label: "ACOS", value: pct(acos), deltaPct: -2.6, sub: "target 28%" },
    { label: "Wasted Spend", value: `<span style="color:var(--color-crimson-bright)">${inrK(waste)}</span>`, sub: "zero-order terms" },
  ];
}
export const getCampaigns = (): CampaignRow[] => [...campaigns].sort((a, b) => b.acos - a.acos);
export const getWasted = (): WastedRow[] => [...wasted].sort((a, b) => b.spend - a.spend);

export function getReturns(f: Filter): ReturnRow[] {
  return products
    .map((p) => {
      const heavy = /SILK|VELVET|LEATHER/.test(p.sku) ? 1.6 : 1;
      const rate = (2.5 + rndStable(p.sku) * 9) * heavy;
      const reason = returnReasons[Math.floor(rndStable(p.sku + "r") * returnReasons.length)].reason;
      const vel = f.channel === "all" ? p.azVel + p.fkVel + p.shVel : velFor(p, f.channel);
      const sold = Math.round(vel * f.days);
      const units = Math.round((sold * rate) / 100);
      return { sku: p.sku, name: p.name, rate, reason, units, sold };
    })
    .filter((r) => r.units > 0)
    .sort((a, b) => b.rate - a.rate);
}

export function getReturnsKpis(f: Filter): Kpi[] {
  const data = getReturns(f);
  const returned = data.reduce((a, d) => a + d.units, 0);
  const sold = data.reduce((a, d) => a + d.sold, 0);
  const accountRate = sold ? (returned / sold) * 100 : 0;
  const topByUnits = [...data].sort((a, b) => b.units - a.units)[0];
  const worst = data.filter((d) => d.sold >= 3)[0];
  return [
    { label: "Account Return Rate", value: sold ? pct(accountRate) : "—", sub: `${num(returned)} of ${num(sold)} units sold` },
    { label: "Units Returned", value: num(returned), sub: `last ${f.days} days` },
    { label: "Top SKU Returns", value: topByUnits ? num(topByUnits.units) : "—", sub: topByUnits?.sku || "no returns in window" },
    { label: "Highest Return Rate", value: worst ? worst.rate.toFixed(1) + "%" : "—", sub: worst ? `${worst.sku} · ≥3 sold` : "no SKU with ≥3 sold" },
  ];
}
export const getReturnReasons = (): ReturnReason[] => returnReasons;

export function getProducts(): ProductRow[] {
  return products.map((p) => {
    const azM = ((p.azPrice - p.cost) / p.azPrice) * 100;
    const fkM = ((p.fkPrice - p.cost) / p.fkPrice) * 100;
    const shM = ((p.shPrice - p.cost) / p.shPrice) * 100;
    const vels: [Channel, number][] = [["amazon", p.azVel], ["flipkart", p.fkVel], ["shopify", p.shVel]];
    const best = vels.sort((a, b) => b[1] - a[1])[0][0];
    return {
      sku: p.sku,
      name: p.name,
      amazonVel: p.azVel,
      flipkartVel: p.fkVel,
      shopifyVel: p.shVel,
      marginPct: (azM + fkM + shM) / 3,
      totalStock: p.azStock + p.fkStock + p.shStock,
      bestChannel: best,
    };
  });
}

export function getDecisions(f: Filter): Decision[] {
  const list: Decision[] = [];
  if (f.channel === "all") {
    products.forEach((p) => {
      const vel = p.azVel + p.fkVel + p.shVel;
      const stock = p.azStock + p.fkStock + p.shStock;
      const cover = stock / vel;
      if (cover < 10) {
        const lowest = ([["amazon", p.azStock], ["flipkart", p.fkStock], ["shopify", p.shStock]] as [Channel, number][]).sort((a, b) => a[1] - b[1])[0][0];
        list.push({
          icon: "box",
          title: `Stockout risk · ${p.name}`,
          severity: "high",
          severityLabel: "High",
          channel: lowest,
          body: `Only ${Math.round(cover)} days of cover at current velocity (${vel.toFixed(1)} units/day). Reorder before it hits zero.`,
          ask: `Plan a restock for ${p.sku} — how many units to order to cover 45 days plus a Diwali buffer?`,
        });
      }
    });
  }
  if (adChannelAvailable(f)) {
    const totalWaste = wasted.filter((w) => w.orders === 0).reduce((a, w) => a + w.spend, 0);
    list.push({
      icon: "coin",
      title: "Wasted ad spend detected",
      severity: "high",
      severityLabel: "High",
      channel: "amazon",
      body: `${inr(totalWaste)} spent on ${wasted.filter((w) => w.orders === 0).length} search terms with zero orders this period. Add as negative keywords.`,
      ask: "List the exact negative keywords to add and the campaigns to add them to, with estimated monthly savings.",
    });
    const bad = campaigns.filter((c) => c.acos > 50);
    if (bad.length) {
      list.push({
        icon: "target",
        title: `ACOS outlier · ${bad[0].name}`,
        severity: "med",
        severityLabel: "Medium",
        channel: "amazon",
        body: `Running at ${bad[0].acos}% ACOS — well above the 28% target. Review bids or pause underperforming keywords.`,
        ask: `Why is ${bad[0].name} running at high ACOS and what bid changes do you recommend?`,
      });
    }
  }
  const worst = getReturns(f)[0];
  if (worst) {
    list.push({
      icon: "rotate",
      title: `Return-rate spike · ${worst.name}`,
      severity: "med",
      severityLabel: "Medium",
      body: `${worst.rate.toFixed(1)}% return rate — top reason "${worst.reason}". Investigate packaging / listing accuracy.`,
      ask: `Break down returns for ${worst.sku} by reason and channel and suggest fixes.`,
    });
  }
  return list;
}

export function decisionCount(): number {
  return getDecisions({ channel: "all", days: 30 }).length;
}

/* ---------- simulated Claude answer (grounded in the same data) ---------- */
export function claudeAnswer(qRaw: string): string {
  const q = qRaw.toLowerCase();
  if (q.includes("wast") || q.includes("negative") || q.includes("keyword")) {
    const w = wasted.filter((x) => x.orders === 0);
    const total = w.reduce((a, x) => a + x.spend, 0);
    return `I queried <code>ad_spend</code> for the selected window:
    <div class="sql">SELECT keyword_or_search_term, spend, clicks, orders
FROM ad_spend
WHERE channel='amazon' AND orders=0 AND spend>500
ORDER BY spend DESC;</div>
    <b>${w.length} search terms</b> burned <b>${inr(total)}</b> with zero orders. Add these as <b>negative exact</b> keywords:
    <ul>${w.slice(0, 4).map((x) => `<li>“${x.term}” — ${inr(x.spend)}, ${x.clicks} clicks</li>`).join("")}</ul>
    <p style="margin-top:8px">Estimated monthly saving ≈ <b>${inr(total * 1.4)}</b>. Apply negatives to the broad/auto campaigns; keep exact campaigns running. <i>You approve and execute in Seller Central.</i></p>`;
  }
  if (q.includes("stock") || q.includes("restock") || q.includes("diwali") || q.includes("reorder")) {
    const rows = getStockHealth({ channel: "all", days: 30 }).filter((r) => r.cover < 14);
    return `Using daily <code>inventory</code> snapshots vs trailing-14-day velocity:
    <div class="sql">SELECT internal_sku, available_qty,
       available_qty / vel_14d AS days_cover
FROM v_inventory_latest JOIN v_velocity_14d USING(internal_sku)
WHERE days_cover < 14 ORDER BY days_cover;</div>
    <b>${rows.length} SKUs</b> need attention:
    <ul>${rows.slice(0, 5).map((r) => `<li><b>${r.name}</b> — ${Math.round(r.cover)} days cover, reorder ≈ <b>${Math.max(0, Math.ceil(r.velocity * 45 - r.stock))} units</b> for 45-day cover</li>`).join("")}</ul>
    <p style="margin-top:8px">With Big Billion Days / Diwali demand lift, add a 30% buffer on the candle and serum lines.</p>`;
  }
  if (q.includes("margin") || q.includes("profitable") || q.includes("amazon or flipkart")) {
    const p = products[0];
    const azM = ((p.azPrice - p.cost) / p.azPrice) * 100;
    const fkM = ((p.fkPrice - p.cost) / p.fkPrice) * 100;
    return `Joining <code>order_items</code> to <code>sku_master</code> economics for ${p.name}:
    <div class="sql">SELECT channel, AVG(unit_price), cost_price,
   (AVG(unit_price)-cost_price)/AVG(unit_price)*100 AS margin
FROM order_items JOIN sku_master USING(internal_sku)
WHERE internal_sku='${p.sku}' GROUP BY channel;</div>
    <p style="margin-top:8px"><b>${azM > fkM ? "Amazon" : "Flipkart"}</b> yields the higher contribution margin (${Math.abs(azM - fkM).toFixed(1)} pts). Velocity favours <b>${p.azVel > p.fkVel ? "Amazon" : "Flipkart"}</b>, so push inventory there.</p>`;
  }
  if (q.includes("return")) {
    const d = getReturns({ channel: "all", days: 30 });
    return `Ranking <code>returns</code> against <code>order_items</code> by <code>internal_sku</code>:
    <div class="sql">SELECT internal_sku, COUNT(*) ret, reason
FROM returns GROUP BY internal_sku, reason
ORDER BY ret DESC;</div>
    <ul>${d.slice(0, 4).map((x) => `<li><b>${x.name}</b> — ${x.rate.toFixed(1)}% · top reason “${x.reason}”</li>`).join("")}</ul>
    <p style="margin-top:8px">The leaders are textile/leather lines with “damaged in transit” dominant — a packaging fix, not a product defect.</p>`;
  }
  return `I'd answer that by writing SQL against the read-only warehouse and reasoning over the result — pulling from <code>orders</code>, <code>order_items</code>, <code>inventory</code> or <code>ad_spend</code>, joining to <code>sku_master</code> for economics, and returning a recommendation with the evidence behind it. Try one of the suggested questions for a worked example.`;
}

export { channelName };
