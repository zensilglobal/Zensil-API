import { parseFilter } from "@/lib/filter";
import { getReturnsKpis, getReturns, getReturnReasons } from "@/lib/queries";
import { KpiGrid, Card, Bar } from "@/components/ui";
import { ReasonsDonut } from "@/components/charts";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const [kpis, rows, reasons] = await Promise.all([getReturnsKpis(f), getReturns(f), getReturnReasons()]);
  const max = rows[0]?.rate || 1;

  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="grid g-3 mt">
        <Card title="Return Reasons" sub="Share of returns">
          <ReasonsDonut data={reasons} />
          <div className="legend">
            {reasons.map((r) => (
              <span key={r.reason}>
                <i style={{ background: r.color }} />
                {r.reason} {r.share}%
              </span>
            ))}
          </div>
        </Card>
        <Card title="Highest Return-Rate Products" sub="Ranked by return rate · top reason shown" className="span-2">
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="right">Units Returned</th>
                  <th>Return Rate</th>
                  <th>Top Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.sku}>
                    <td className="strong">
                      {d.name}
                      <div className="tiny muted num">{d.sku}</div>
                    </td>
                    <td className="right num">{d.units}</td>
                    <td>
                      <div className="flex" style={{ gap: 10 }}>
                        <span className="num" style={{ minWidth: 42 }}>
                          {d.rate.toFixed(1)}%
                        </span>
                        <Bar pct={(d.rate / max) * 100} color="linear-gradient(90deg,var(--color-gold),var(--color-crimson))" />
                      </div>
                    </td>
                    <td>{d.reason}</td>
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
