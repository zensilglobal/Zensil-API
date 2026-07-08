export type Channel = "amazon" | "flipkart" | "shopify";
export type ChannelFilter = "all" | Channel;
export type RangeDays = 7 | 30 | 90;

export interface Filter {
  channel: ChannelFilter;
  days: RangeDays;
}

export interface Kpi {
  label: string;
  value: string;
  deltaPct?: number | null;
  sub?: string;
  splitHtml?: string;
  /** When set, the KPI card becomes a link to this drill-down page. */
  href?: string;
}

/** Revenue drill-down: one row per SKU × channel in the window. */
export interface SkuRevenueRow {
  sku: string;
  name: string;
  channel: Channel;
  units: number;
  orders: number;
  avgPrice: number;
  revenue: number;
}

/** Order drill-down: one row per order line in the window. */
export interface OrderLineRow {
  id: string;
  channel: Channel;
  date: string; // ISO
  sku: string;
  name: string;
  qty: number;
  price: number;
  value: number;
  region: string;
  status: "delivered" | "transit" | "pending" | "returned";
}

export interface TrendPoint {
  label: string;
  /** ISO yyyy-mm-dd of the point — used for click-through to that day's orders */
  date?: string;
  amazon: number;
  flipkart: number;
  shopify: number;
}

export interface OrderRow {
  id: string;
  channel: Channel;
  date: string; // ISO
  sku: string;
  name: string;
  qty: number;
  value: number;
  region: string;
  status: "delivered" | "transit" | "pending" | "returned";
}

export interface StockRow {
  sku: string;
  name: string;
  /** total sellable units (fba + easyShip) */
  stock: number;
  /** Amazon FBA (AFN) units on hand */
  fba: number;
  /** seller-fulfilled units: Amazon Easy Ship (MFN) + Flipkart + Shopify */
  easyShip: number;
  velocity: number;
  cover: number;
  status: "critical" | "low" | "healthy";
}

export interface CampaignRow {
  name: string;
  spend: number;
  sales: number;
  acos: number;
  clicks: number;
  orders: number;
}

export interface WastedRow {
  term: string;
  spend: number;
  clicks: number;
  orders: number;
}

export interface ReturnRow {
  sku: string;
  name: string;
  /** returned ÷ sold in the same window; 0 when nothing sold in window */
  rate: number;
  reason: string;
  /** units returned in window */
  units: number;
  /** units sold in the same window (rate denominator) */
  sold: number;
}

/** Returns drill-down: one row per individual return event. */
export interface ReturnLineRow {
  id: string;
  channel: Channel;
  date: string; // ISO date
  sku: string;
  name: string;
  qty: number;
  reason: string;
}

export interface TopProduct {
  name: string;
  value: number;
  units: number;
  avgPrice: number;
}

export interface ReturnReason {
  reason: string;
  share: number;
  color: string;
}

export interface ProductRow {
  sku: string;
  name: string;
  amazonVel: number;
  flipkartVel: number;
  shopifyVel: number;
  marginPct: number;
  totalStock: number;
  bestChannel: Channel;
}

export interface Decision {
  icon: string;
  title: string;
  body: string;
  severity: "high" | "med" | "low";
  severityLabel: string;
  channel?: Channel;
  ask: string;
}

export interface ChannelSplit {
  amazon: number;
  flipkart: number;
  shopify: number;
}

/** Warehouse freshness for the sidebar pill; null = sample-data mode. */
export interface SyncStatus {
  label: string; // e.g. "2h ago"
  ok: boolean; // false when stale (>6h) or a pipeline reported an error
}
