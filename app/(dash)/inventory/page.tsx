import Link from "next/link";
import { Sparkles } from "lucide-react";
import { parseFilter, buildQuery } from "@/lib/filter";
import { getInventoryKpis, getStockHealth } from "@/lib/queries";
import { num } from "@/lib/format";
import { restockCsv, todayStamp } from "@/lib/exports";
import { askHref } from "@/components/DecisionCard";
import DownloadCsv from "@/components/DownloadCsv";
import { KpiGrid, Card, StatusPill, Bar } from "@/components/ui";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const [kpis, rows] = await Promise.all([getInventoryKpis(f), getStockHealth(f)]);
  const maxCover = Math.max(...rows.map((r) => r.cover), 1);
  const needsRestock = rows.filter((r) => r.status !== "healthy");
  const restockRows = needsRestock.length ? needsRestock : rows;

  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card
          title="Stock Health"
          sub="Days-of-cover at trailing-14-day velocity · sorted by urgency"
          action={
            <div className="flex" style={{ gap: 8 }}>
              <DownloadCsv
                csv={restockCsv(restockRows)}
                filename={`zensil-restock-${todayStamp()}.csv`}
                label="Export restock plan"
              />
              <Link
                className="btn gold"
                href={askHref("Plan a restock for all SKUs with fewer than 14 days of cover before the next sale event", f)}
              >
                <Sparkles size={15} /> Ask Claude to plan a restock
              </Link>
            </div>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th className="right">FBA On Hand</th>
                  <th className="right">Easy Ship On Hand</th>
                  <th className="right">Velocity</th>
                  <th>Days of Cover</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const col =
                    r.status === "critical" ? "var(--color-crimson)" : r.status === "low" ? "var(--color-gold)" : "var(--color-green)";
                  return (
                    <tr key={r.sku}>
                      <td className="strong">
                        <Link className="plink" href={`/products/${encodeURIComponent(r.sku)}${buildQuery(f)}`}>
                          {r.name}
                        </Link>
                      </td>
                      <td className="num tiny muted">{r.sku}</td>
                      <td className="right num strong">{num(r.fba)}</td>
                      <td className="right num strong">{num(r.easyShip)}</td>
                      <td className="right num">{r.velocity.toFixed(1)}/d</td>
                      <td>
                        <div className="flex" style={{ gap: 10 }}>
                          <span className="num" style={{ minWidth: 34 }}>
                            {Math.round(r.cover)}d
                          </span>
                          <Bar pct={(r.cover / maxCover) * 100} color={col} />
                        </div>
                      </td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td className="right">
                        <Link
                          className="btn ghost tiny"
                          href={askHref(`How many units of ${r.sku} should I reorder to reach 45 days of cover?`, f)}
                        >
                          Plan
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
