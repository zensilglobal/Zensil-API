import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, X } from "lucide-react";
import { parseFilter, buildQuery } from "@/lib/filter";
import {
  getRevenueBySku,
  getOrderLines,
  getAdvertisingKpis,
  getCampaigns,
  getWasted,
  adChannelAvailable,
  getInventoryKpis,
  getStockHealth,
  getReturnsKpis,
  getReturns,
  getReturnLines,
} from "@/lib/queries";
import { inr, inrK, num, dayLabel } from "@/lib/format";
import { Filter, OrderLineRow } from "@/lib/types";
import { KpiGrid, Card } from "@/components/ui";
import DrilldownTable, { DrillCol } from "@/components/DrilldownTable";

/*
  Drill-down behind the KPI cards. Server component fetches the full row
  set for the active window (global channel/period filters apply),
  DrilldownTable adds search / column filters / sort / CSV export.
*/

const METRICS = ["revenue", "orders", "aov", "acos", "stock", "returns"] as const;
type Metric = (typeof METRICS)[number];

const BACK: Record<Metric, { href: string; label: string }> = {
  revenue: { href: "/", label: "Back to Overview" },
  orders: { href: "/", label: "Back to Overview" },
  aov: { href: "/", label: "Back to Overview" },
  acos: { href: "/", label: "Back to Overview" },
  stock: { href: "/inventory", label: "Back to Inventory" },
  returns: { href: "/returns", label: "Back to Returns" },
};

function BackLink({ f, metric }: { f: Filter; metric: Metric }) {
  const b = BACK[metric];
  return (
    <Link className="btn ghost" href={`${b.href}${buildQuery(f)}`} style={{ marginBottom: 18 }}>
      <ArrowLeft size={15} /> {b.label}
    </Link>
  );
}

const ORDER_LINE_COLS: DrillCol[] = [
  { key: "id", label: "Order", strong: true },
  { key: "date", label: "Date", kind: "date" },
  { key: "channel", label: "Channel", kind: "channel", filter: true },
  { key: "sku", label: "SKU" },
  { key: "name", label: "Product", strong: true },
  { key: "qty", label: "Units", kind: "int", total: true },
  { key: "price", label: "Unit Price", kind: "money" },
  { key: "value", label: "Value", kind: "money", total: true },
  { key: "region", label: "Region" },
  { key: "status", label: "Status", kind: "status", filter: true },
];

async function RevenueDrill({ f }: { f: Filter }) {
  const rows = await getRevenueBySku(f);
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const units = rows.reduce((a, r) => a + r.units, 0);
  const skus = new Set(rows.map((r) => r.sku)).size;
  const kpis = [
    { label: "Net Revenue", value: inrK(revenue), sub: `last ${f.days} days` },
    { label: "Units Sold", value: num(units), sub: "items" },
    { label: "SKUs Sold", value: num(skus), sub: "with revenue" },
    { label: "Avg Unit Price", value: inr(units ? revenue / units : 0), sub: "revenue ÷ units" },
  ];
  const cols: DrillCol[] = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Product", strong: true },
    { key: "channel", label: "Channel", kind: "channel", filter: true },
    { key: "orders", label: "Orders", kind: "int", total: true },
    { key: "units", label: "Units Sold", kind: "int", total: true },
    { key: "avgPrice", label: "Avg Price", kind: "money" },
    { key: "revenue", label: "Revenue", kind: "money", total: true },
  ];
  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card title="Revenue by Product" sub="Where every rupee came from — SKU × channel, with units and price">
          <DrilldownTable
            rows={rows as unknown as Record<string, string | number>[]}
            cols={cols}
            filename={`zensil-revenue-${f.channel}-${f.days}d`}
            initialSort={{ key: "revenue", dir: "desc" }}
          />
        </Card>
      </div>
    </>
  );
}

async function OrdersDrill({ f, date }: { f: Filter; date?: string }) {
  const all = await getOrderLines(f);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const rows = day ? all.filter((r) => String(r.date).slice(0, 10) === day) : all;
  const orders = new Set(rows.map((r) => r.id)).size;
  const units = rows.reduce((a, r) => a + r.qty, 0);
  const revenue = rows.reduce((a, r) => a + r.value, 0);
  const windowLabel = day ? dayLabel(day + "T00:00:00Z") : `last ${f.days} days`;
  const kpis = [
    { label: "Orders", value: num(orders), sub: windowLabel },
    { label: "Units Sold", value: num(units), sub: "items" },
    { label: "Revenue", value: inrK(revenue), sub: "order lines" },
    { label: "Avg Order Value", value: inr(orders ? revenue / orders : 0), sub: "per order" },
  ];
  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card
          title={day ? `Order Lines — ${windowLabel}` : "All Order Lines"}
          sub="Every order, SKU-wise — product, units, price & status"
          action={
            day ? (
              <Link className="btn ghost" href={`/drilldown/orders${buildQuery(f)}`}>
                <X size={15} /> {windowLabel} only — show all days
              </Link>
            ) : undefined
          }
        >
          <DrilldownTable
            rows={rows as unknown as Record<string, string | number>[]}
            cols={ORDER_LINE_COLS}
            filename={`zensil-orders-${f.channel}-${day || `${f.days}d`}`}
            initialSort={{ key: "date", dir: "desc" }}
          />
        </Card>
      </div>
    </>
  );
}

async function AovDrill({ f }: { f: Filter }) {
  const lines = await getOrderLines(f);
  const byOrder = new Map<string, { id: string; date: string; channel: string; skus: number; units: number; value: number; region: string; status: string }>();
  for (const l of lines as OrderLineRow[]) {
    const o = byOrder.get(l.id) || { id: l.id, date: l.date, channel: l.channel, skus: 0, units: 0, value: 0, region: l.region, status: l.status };
    o.skus += 1;
    o.units += l.qty;
    o.value += l.value;
    byOrder.set(l.id, o);
  }
  const rows = [...byOrder.values()].sort((a, b) => b.value - a.value);
  const revenue = rows.reduce((a, r) => a + r.value, 0);
  const values = rows.map((r) => r.value).sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : 0;
  const kpis = [
    { label: "Avg Order Value", value: inr(rows.length ? revenue / rows.length : 0), sub: `last ${f.days} days` },
    { label: "Median Order", value: inr(median), sub: "typical basket" },
    { label: "Highest Order", value: inr(values.length ? values[values.length - 1] : 0), sub: "single order" },
    { label: "Orders", value: num(rows.length), sub: "behind the average" },
  ];
  const cols: DrillCol[] = [
    { key: "id", label: "Order", strong: true },
    { key: "date", label: "Date", kind: "date" },
    { key: "channel", label: "Channel", kind: "channel", filter: true },
    { key: "skus", label: "SKUs", kind: "int" },
    { key: "units", label: "Units", kind: "int", total: true },
    { key: "value", label: "Order Value", kind: "money", total: true },
    { key: "region", label: "Region" },
    { key: "status", label: "Status", kind: "status", filter: true },
  ];
  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card title="Order Values" sub="Every order that makes up the average — sorted by basket size">
          <DrilldownTable
            rows={rows as unknown as Record<string, string | number>[]}
            cols={cols}
            filename={`zensil-aov-${f.channel}-${f.days}d`}
            initialSort={{ key: "value", dir: "desc" }}
          />
        </Card>
      </div>
    </>
  );
}

async function AcosDrill({ f }: { f: Filter }) {
  if (!adChannelAvailable(f)) {
    return (
      <div className="card">
        <div className="card-b">
          <div className="flex" style={{ gap: 13 }}>
            <Info size={18} color="var(--color-gold)" />
            <div>
              <div className="strong">Advertising data is Amazon-only</div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                Switch the channel filter to <b>Amazon</b> or <b>All</b> to see the ACOS breakdown.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const [kpis, campaigns, wasted] = await Promise.all([getAdvertisingKpis(), getCampaigns(), getWasted()]);
  const campaignCols: DrillCol[] = [
    { key: "name", label: "Campaign", strong: true },
    { key: "spend", label: "Spend", kind: "money", total: true },
    { key: "sales", label: "Ad Sales", kind: "money", total: true },
    { key: "acos", label: "ACOS", kind: "pct" },
    { key: "clicks", label: "Clicks", kind: "int", total: true },
    { key: "orders", label: "Orders", kind: "int", total: true },
  ];
  const wastedCols: DrillCol[] = [
    { key: "term", label: "Search Term", strong: true },
    { key: "spend", label: "Spend", kind: "money", total: true },
    { key: "clicks", label: "Clicks", kind: "int", total: true },
    { key: "orders", label: "Orders", kind: "int", total: true },
  ];
  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card title="Campaign Performance" sub="Spend, attributed sales & ACOS per campaign — target 28%">
          <DrilldownTable
            rows={campaigns as unknown as Record<string, string | number>[]}
            cols={campaignCols}
            filename="zensil-acos-campaigns"
            initialSort={{ key: "acos", dir: "desc" }}
          />
        </Card>
      </div>
      <div className="mt">
        <Card title="Wasted Spend — Search Terms" sub="Terms burning budget with zero / near-zero orders">
          <DrilldownTable
            rows={wasted as unknown as Record<string, string | number>[]}
            cols={wastedCols}
            filename="zensil-acos-wasted-terms"
            initialSort={{ key: "spend", dir: "desc" }}
          />
        </Card>
      </div>
    </>
  );
}

async function StockDrill({ f, status }: { f: Filter; status?: string }) {
  const [kpis, rows] = await Promise.all([getInventoryKpis(f), getStockHealth(f)]);
  const cols: DrillCol[] = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Product", strong: true },
    { key: "fba", label: "FBA On Hand", kind: "int", total: true },
    { key: "easyShip", label: "Easy Ship On Hand", kind: "int", total: true },
    { key: "stock", label: "Total On Hand", kind: "int", total: true },
    { key: "velocity", label: "Velocity/Day", kind: "float" },
    { key: "cover", label: "Days Cover", kind: "int" },
    { key: "status", label: "Status", kind: "status", filter: true },
  ];
  const data = rows.map((r) => ({ ...r, cover: Math.round(r.cover) }));
  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card title="Stock Detail" sub="FBA vs Easy Ship units per SKU · days of cover at trailing-14-day velocity">
          <DrilldownTable
            rows={data as unknown as Record<string, string | number>[]}
            cols={cols}
            filename={`zensil-stock-${f.channel}`}
            initialSort={{ key: "cover", dir: "asc" }}
            initialPicks={status === "critical" || status === "low" || status === "healthy" ? { status } : undefined}
          />
        </Card>
      </div>
    </>
  );
}

async function ReturnsDrill({ f, search }: { f: Filter; search?: string }) {
  const [kpis, rows, lines] = await Promise.all([getReturnsKpis(f), getReturns(f), getReturnLines(f)]);
  const skuCols: DrillCol[] = [
    { key: "sku", label: "SKU" },
    { key: "name", label: "Product", strong: true },
    { key: "units", label: "Units Returned", kind: "int", total: true },
    { key: "sold", label: "Units Sold", kind: "int", total: true },
    { key: "rate", label: "Return Rate", kind: "pct" },
    { key: "reason", label: "Top Reason", filter: true },
  ];
  const lineCols: DrillCol[] = [
    { key: "id", label: "Return ID" },
    { key: "date", label: "Date", kind: "date" },
    { key: "channel", label: "Channel", kind: "channel", filter: true },
    { key: "sku", label: "SKU" },
    { key: "name", label: "Product", strong: true },
    { key: "qty", label: "Units", kind: "int", total: true },
    { key: "reason", label: "Reason", filter: true },
  ];
  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card title="SKU-wise Returns" sub={`Rate = returned ÷ sold in the same ${f.days}-day window`}>
          <DrilldownTable
            rows={rows as unknown as Record<string, string | number>[]}
            cols={skuCols}
            filename={`zensil-returns-sku-${f.channel}-${f.days}d`}
            initialSort={{ key: "units", dir: "desc" }}
            initialSearch={search}
          />
        </Card>
      </div>
      <div className="mt">
        <Card title="Individual Returns" sub="Every return event in the window — date, channel & reason">
          <DrilldownTable
            rows={lines as unknown as Record<string, string | number>[]}
            cols={lineCols}
            filename={`zensil-returns-events-${f.channel}-${f.days}d`}
            initialSort={{ key: "date", dir: "desc" }}
            initialSearch={search}
          />
        </Card>
      </div>
    </>
  );
}

export default async function DrilldownPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { metric } = await params;
  if (!METRICS.includes(metric as Metric)) notFound();
  const sp = await searchParams;
  const f = parseFilter(sp);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  return (
    <>
      <BackLink f={f} metric={metric as Metric} />
      {metric === "revenue" && <RevenueDrill f={f} />}
      {metric === "orders" && <OrdersDrill f={f} date={one(sp.date)} />}
      {metric === "aov" && <AovDrill f={f} />}
      {metric === "acos" && <AcosDrill f={f} />}
      {metric === "stock" && <StockDrill f={f} status={one(sp.status)} />}
      {metric === "returns" && <ReturnsDrill f={f} search={one(sp.q)} />}
    </>
  );
}
