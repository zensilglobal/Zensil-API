import Link from "next/link";
import { Sparkles, Info } from "lucide-react";
import { parseFilter } from "@/lib/filter";
import { getAdvertisingKpis, getCampaigns, getWasted, adChannelAvailable } from "@/lib/queries";
import { inr } from "@/lib/format";
import { askHref } from "@/components/DecisionCard";
import { KpiGrid, Card } from "@/components/ui";

export default async function AdvertisingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);

  if (!adChannelAvailable(f)) {
    return (
      <div className="card">
        <div className="card-b">
          <div className="flex" style={{ gap: 13 }}>
            <div className="ic" style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(212,175,55,.1)", border: "1px solid var(--line)" }}>
              <Info size={18} color="var(--color-gold)" />
            </div>
            <div>
              <div className="strong">No seller-facing advertising API for this channel</div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                Flipkart and Shopify expose no ingestible ads API. Advertising analysis is Amazon-only in v1. Switch the channel filter to <b>Amazon</b> or <b>All</b>.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [kpis, campaigns, wasted] = await Promise.all([getAdvertisingKpis(), getCampaigns(), getWasted()]);

  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="grid g-2 mt">
        <Card title="Campaign Performance" sub="Colour-coded by ACOS vs target (28%)">
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="right">Spend</th>
                  <th className="right">Sales</th>
                  <th className="right">ACOS</th>
                  <th className="right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const col = c.acos > 50 ? "var(--color-crimson-bright)" : c.acos > 28 ? "var(--color-gold-soft)" : "var(--color-green-soft)";
                  return (
                    <tr key={c.name}>
                      <td className="strong">{c.name}</td>
                      <td className="right num">{inr(c.spend)}</td>
                      <td className="right num">{inr(c.sales)}</td>
                      <td className="right num" style={{ color: col, fontWeight: 700 }}>
                        {c.acos.toFixed(1)}%
                      </td>
                      <td className="right num">{c.orders}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card
          title="Wasted Spend — Search Terms"
          sub="Over ₹500 spend, zero / near-zero orders"
          action={
            <Link
              className="btn ghost"
              href={askHref("Which search terms should I add as negative keywords this week and how much spend will it save?", f)}
            >
              <Sparkles size={15} /> Harvest negatives
            </Link>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Search Term</th>
                  <th className="right">Spend</th>
                  <th className="right">Clicks</th>
                  <th className="right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {wasted.map((w) => (
                  <tr key={w.term}>
                    <td className="strong">{w.term}</td>
                    <td className="right num" style={{ color: "var(--color-crimson-bright)", fontWeight: 700 }}>
                      {inr(w.spend)}
                    </td>
                    <td className="right num">{w.clicks}</td>
                    <td className="right num" style={w.orders === 0 ? { color: "var(--color-crimson-bright)" } : undefined}>
                      {w.orders}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
