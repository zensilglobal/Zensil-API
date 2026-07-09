import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { parseFilter, buildQuery, windowLabel } from "@/lib/filter";
import {
  getProducts,
  getRevenueBySku,
  getOrderLines,
  getStockHealth,
  getReturns,
  getReturnLines,
  getSkuTrend,
} from "@/lib/queries";
import { inr, inrK, num, pct } from "@/lib/format";
import { KpiGrid, Card, ChannelChip, StatusPill } from "@/components/ui";
import { RevenueTrend } from "@/components/charts";
import DrilldownTable, { DrillCol } from "@/components/DrilldownTable";
import { askHref } from "@/components/DecisionCard";

/*
  Product detail — everything the warehouse knows about one SKU, in one
  place: window sales by channel, revenue trend, stock health, every
  order line and every return event. Reached by clicking a product row
  anywhere in the app. Global channel/date filters apply here too.
*/

const LINE_COLS: DrillCol[] = [
  { key: "id", label: "Order", strong: true },
  { key: "date", label: "Date", kind: "date" },
  { key: "channel", label: "Channel", kind: "channel", filter: true },
  { key: "qty", label: "Units", kind: "int", total: true },
  { key: "price", label: "Unit Price", kind: "money" },
  { key: "value", label: "Value", kind: "money", total: true },
  { key: "region", label: "Region" },
  { key: "status", label: "Status", kind: "status", filter: true },
];

const RETURN_COLS: DrillCol[] = [
  { key: "id", label: "Return ID" },
  { key: "date", label: "Date", kind: "date" },
  { key: "channel", label: "Channel", kind: "channel", filter: true },
  { key: "qty", label: "Units", kind: "int", total: true },
  { key: "reason", label: "Reason", filter: true },
];

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sku: rawSku } = await params;
  const sku = decodeURIComponent(rawSku);
  const f = parseFilter(await searchParams);

  const [products, revAll, linesAll, stockAll, returnsAll, returnLinesAll, trend] = await Promise.all([
    getProducts(),
    getRevenueBySku(f),
    getOrderLines(f),
    getStockHealth(f),
    getReturns(f),
    getReturnLines(f),
    getSkuTrend(f, sku),
  ]);

  const prod = products.find((p) => p.sku === sku);
  if (!prod) notFound();

  const rev = revAll.filter((r) => r.sku === sku);
  const lines = linesAll.filter((l) => l.sku === sku);
  const stock = stockAll.find((s) => s.sku === sku);
  const ret = returnsAll.find((r) => r.sku === sku);
  const retLines = returnLinesAll.filter((r) => r.sku === sku);

  const revenue = rev.reduce((a, r) => a + r.revenue, 0);
  const units = rev.reduce((a, r) => a + r.units, 0);
  const orders = rev.reduce((a, r) => a + r.orders, 0);
  const label = windowLabel(f);

  const kpis = [
    { label: "Revenue", value: inrK(revenue), sub: label },
    { label: "Units Sold", value: num(units), sub: label },
    { label: "Orders", value: num(orders), sub: label },
    { label: "Avg Selling Price", value: inr(units ? revenue / units : 0), sub: "revenue ÷ units" },
  ];

  const qs = buildQuery(f);

  return (
    <>
      <Link className="btn ghost" href={`/products${qs}`} style={{ marginBottom: 18 }}>
        <ArrowLeft size={15} /> Back to Products
      </Link>

      <div className="prod-hero">
        <div className="avatar">{prod.name.charAt(0)}</div>
        <div>
          <h2>{prod.name}</h2>
          <div className="sku-line">
            <span className="sku-tag">{prod.sku}</span>
            <span className="tiny muted">Best channel</span>
            <ChannelChip channel={prod.bestChannel} />
            {stock && <StatusPill status={stock.status} />}
          </div>
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <Link
          className="btn gold"
          href={askHref(`Give me a full performance review of ${prod.sku} (${prod.name}) — sales, stock, returns and what to do next.`, f)}
        >
          <Sparkles size={15} /> Ask Claude about this SKU
        </Link>
      </div>

      <KpiGrid kpis={kpis} />

      <div className="mt">
        <Card>
          <dl className="facts" style={{ margin: 0 }}>
            <div>
              <dt>FBA On Hand</dt>
              <dd>{stock ? num(stock.fba) : "—"} <small>units</small></dd>
            </div>
            <div>
              <dt>Easy Ship On Hand</dt>
              <dd>{stock ? num(stock.easyShip) : "—"} <small>units</small></dd>
            </div>
            <div>
              <dt>Days of Cover</dt>
              <dd>{stock ? Math.round(stock.cover) : "—"} <small>days</small></dd>
            </div>
            <div>
              <dt>Velocity</dt>
              <dd>{stock ? stock.velocity.toFixed(1) : "—"} <small>units/day</small></dd>
            </div>
            <div>
              <dt>Contribution Margin</dt>
              <dd>{pct(prod.marginPct)}</dd>
            </div>
            <div>
              <dt>Return Rate</dt>
              <dd>{ret ? pct(ret.rate) : "0%"} <small>{ret ? `top: ${ret.reason}` : "no returns in window"}</small></dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid g-3 mt">
        <Card title="Revenue Trend" sub={`Daily revenue for this SKU by channel · ${label}`} className="span-2">
          <RevenueTrend data={trend} channel={f.channel} />
        </Card>
        <Card title="Channel Breakdown" sub="This SKU's window sales per channel">
          {rev.length ? (
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="right">Units</th>
                  <th className="right">Avg Price</th>
                  <th className="right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rev.map((r) => (
                  <tr key={r.channel}>
                    <td><ChannelChip channel={r.channel} /></td>
                    <td className="right num">{num(r.units)}</td>
                    <td className="right num">{inr(r.avgPrice)}</td>
                    <td className="right num strong">{inr(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No sales in this window</div>
          )}
        </Card>
      </div>

      <div className="mt">
        <Card title="Order Lines" sub={`Every order for ${prod.sku} in the window`}>
          <DrilldownTable
            rows={lines as unknown as Record<string, string | number>[]}
            cols={LINE_COLS}
            filename={`zensil-${prod.sku}-orders`}
            initialSort={{ key: "date", dir: "desc" }}
          />
        </Card>
      </div>

      <div className="mt">
        <Card title="Return Events" sub={`Every return for ${prod.sku} in the window — date, channel & reason`}>
          {retLines.length ? (
            <DrilldownTable
              rows={retLines as unknown as Record<string, string | number>[]}
              cols={RETURN_COLS}
              filename={`zensil-${prod.sku}-returns`}
              initialSort={{ key: "date", dir: "desc" }}
            />
          ) : (
            <div className="empty">No returns in this window 🎉</div>
          )}
        </Card>
      </div>
    </>
  );
}
