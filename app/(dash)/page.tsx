import Link from "next/link";
import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { parseFilter, buildQuery } from "@/lib/filter";
import { liveEnabled } from "@/lib/live";
import LiveStrip, { LiveStripSkeleton } from "@/components/LiveStrip";
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
import WarehouseError from "@/components/WarehouseError";
import { Filter } from "@/lib/types";

/*
  The only dashboard page that handles its own warehouse failure instead of
  throwing to (dash)/error.tsx. The live strip reads the marketplace APIs
  directly, so it stays correct while Neon is over quota or suspended —
  throwing would replace the whole route with the error panel and take the
  one still-working section down with it.
*/
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);

  return (
    <>
      {/* Checked here rather than inside LiveStrip so an unconfigured
          install renders nothing at all, instead of flashing the skeleton
          for a section that resolves to null. */}
      {liveEnabled() && (
        <Suspense fallback={<LiveStripSkeleton />}>
          <LiveStrip />
        </Suspense>
      )}

      {/* Own boundary so a slow warehouse does not hold back the strip. */}
      <Suspense fallback={null}>
        <Warehouse f={f} />
      </Suspense>
    </>
  );
}

async function Warehouse({ f }: { f: Filter }) {
  let data: [
    Awaited<ReturnType<typeof getOverviewKpis>>,
    Awaited<ReturnType<typeof getTrend>>,
    Awaited<ReturnType<typeof getChannelSplit>>,
    Awaited<ReturnType<typeof getTopProducts>>,
    Awaited<ReturnType<typeof getDecisions>>,
  ];
  try {
    data = await Promise.all([
      getOverviewKpis(f),
      getTrend(f),
      getChannelSplit(f),
      getTopProducts(f),
      getDecisions(f),
    ]);
  } catch (err) {
    // Logged server-side because React redacts the message before it reaches
    // the panel; the panel re-derives the cause from /api/health.
    console.error("overview warehouse read failed:", err);
    return <WarehouseError />;
  }

  const [kpis, trend, split, top, decisions] = data;
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
