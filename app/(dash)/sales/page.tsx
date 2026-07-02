import { parseFilter } from "@/lib/filter";
import { getSalesKpis, getOrdersPerDay, getRecentOrders } from "@/lib/queries";
import { inr, num, dayLabel } from "@/lib/format";
import { KpiGrid, Card, ChannelChip, StatusPill } from "@/components/ui";
import { OrdersBar } from "@/components/charts";

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilter(await searchParams);
  const [kpis, perDay, recent] = await Promise.all([getSalesKpis(f), getOrdersPerDay(f), getRecentOrders(f)]);
  const { rows, total } = recent;

  return (
    <>
      <KpiGrid kpis={kpis} />
      <div className="mt">
        <Card title="Orders Per Day" sub="Order count by channel">
          <OrdersBar data={perDay} channel={f.channel} />
        </Card>
      </div>
      <div className="mt">
        <Card
          title="Recent Orders"
          sub="Latest marketplace orders & fulfilment status"
          action={<span className="tiny muted">{num(total)} orders in window</span>}
        >
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Channel</th>
                  <th>Product</th>
                  <th className="right">Qty</th>
                  <th className="right">Value</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="num strong">{o.id}</td>
                    <td>
                      <ChannelChip channel={o.channel} />
                    </td>
                    <td className="strong truncate-cell">{o.name}</td>
                    <td className="right num">{o.qty}</td>
                    <td className="right num strong">{inr(o.value)}</td>
                    <td>{o.region}</td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                    <td className="tiny">{dayLabel(o.date)}</td>
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
