import { parseFilter } from "@/lib/filter";
import { getReturnsKpis, getReturns, getReturnReasons } from "@/lib/queries";
import { KpiGrid, Card } from "@/components/ui";
import { ReasonsDonut } from "@/components/charts";
import DrilldownTable, { DrillCol } from "@/components/DrilldownTable";

const RETURN_COLS: DrillCol[] = [
  { key: "sku", label: "SKU" },
  { key: "name", label: "Product", strong: true },
  { key: "units", label: "Units Returned", kind: "int", total: true },
  { key: "sold", label: "Units Sold", kind: "int", total: true },
  { key: "rate", label: "Return Rate", kind: "pct" },
  { key: "reason", label: "Top Reason", filter: true },
];

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const [kpis, rows, reasons] = await Promise.all([getReturnsKpis(f), getReturns(f), getReturnReasons(f)]);

  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="grid g-3 mt">
        <Card title="Return Reasons" sub={`Share of returned units · last ${f.days} days`}>
          {reasons.length ? (
            <>
              <ReasonsDonut data={reasons} />
              <div className="legend">
                {reasons.map((r) => (
                  <span key={r.reason}>
                    <i style={{ background: r.color }} />
                    {r.reason} {r.share}%
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">No returns in this window</div>
          )}
        </Card>
        <Card
          title="SKU-wise Returns"
          sub={`Rate = returned ÷ sold in the same ${f.days}-day window · sort any column`}
          className="span-2"
        >
          <DrilldownTable
            rows={rows as unknown as Record<string, string | number>[]}
            cols={RETURN_COLS}
            filename={`zensil-returns-${f.channel}-${f.days}d`}
            initialSort={{ key: "units", dir: "desc" }}
          />
        </Card>
      </div>
    </>
  );
}
