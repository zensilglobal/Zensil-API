import Link from "next/link";
import { Sparkles } from "lucide-react";
import { parseFilter, buildQuery } from "@/lib/filter";
import {
  getOverviewKpis,
  getTrend,
  getChannelSplit,
  getTopProducts,
  getDecisions,
} from "@/lib/queries";
import { inr, inrK, num } from "@/lib/format";
import { KpiGrid, Card } from "@/components/ui";
import { RevenueTrend, ChannelDonut } from "@/components/charts";
import { DecisionCard } from "@/components/DecisionCard";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const [kpis, trend, split, top, decisions] = await Promise.all([
    getOverviewKpis(f),
    getTrend(f),
    getChannelSplit(f),
    getTopProducts(f),
    getDecisions(f),
  ]);
  const max = top.length ? top[0].value : 1;
  const splitTotal = split.amazon + split.flipkart + split.shopify || 1;
  const legend = [
    { name: "Amazon", value: split.amazon, color: "var(--color-amazon)" },
    { name: "Flipkart", value: split.flipkart, color: "var(--color-flipkart)" },
    { name: "Shopify", value: split.shopify, color: "var(--color-shopify)" },
  ];

  return (
    <>
      <KpiGrid kpis={kpis} />

      <div className="grid g-3 mt">
        <Card title="Revenue Trend" sub="Daily net revenue by channel (INR)" className="span-2">
          <RevenueTrend data={trend} channel={f.channel} />
        </Card>
        <Card title="Channel Split" sub="Revenue contribution">
          <ChannelDonut split={split} />
          <div className="legend">
            {legend
              .filter((l) => l.value > 0)
              .map((l) => (
                <span key={l.name}>
                  <i style={{ background: l.color }} />
                  {l.name} · {Math.round((l.value / splitTotal) * 100)}% · {inrK(l.value)}
                </span>
              ))}
          </div>
        </Card>
      </div>

      <div className="grid g-3 mt">
        <Card
          title="Decisions Waiting On You"
          sub="Surfaced by the pipeline · approve & execute manually"
          className="span-2"
          action={
            <Link className="btn ghost" href="/insights">
              <Sparkles size={15} /> Ask Gemini why
            </Link>
          }
        >
          {decisions.length ? (
            decisions.map((d, i) => <DecisionCard key={i} d={d} filter={f} />)
          ) : (
            <div className="empty">No decisions pending 🎉</div>
          )}
        </Card>
        <Card title="Top Products" sub="By revenue, period · units & avg price">
          {top.length ? (
            top.map((p) => (
              <div key={p.name} style={{ marginBottom: 14 }}>
                <div className="flex between" style={{ marginBottom: 3 }}>
                  <Link
                    className="plink tiny strong truncate-cell"
                    style={{ maxWidth: 160 }}
                    href={`/products/${encodeURIComponent(p.sku)}${buildQuery(f)}`}
                  >
                    {p.name}
                  </Link>
                  <span className="num tiny">{inrK(p.value)}</span>
                </div>
                <div className="tiny muted" style={{ marginBottom: 6 }}>
                  {num(p.units)} units · avg {inr(p.avgPrice)}
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: `${(p.value / max) * 100}%`,
                      background: "linear-gradient(90deg,var(--brand),var(--color-gold))",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No data</div>
          )}
        </Card>
      </div>
    </>
  );
}
