import "server-only";
import { q, q1 } from "./db";
import {
  Filter,
  Kpi,
  TrendPoint,
  ChannelSplit,
  OrderRow,
  SkuRevenueRow,
  OrderLineRow,
  StockRow,
  CampaignRow,
  WastedRow,
  ReturnRow,
  ReturnLineRow,
  ReturnReason,
  TopProduct,
  ProductRow,
  Decision,
  Channel,
  SyncStatus,
} from "./types";
import { inr, inrK, num, pct, deltaPct } from "./format";
import { buildQuery } from "./filter";

/* channel filter helper: days is always $1; channel (if any) is $2 */
function ch(f: Filter): { clause: string; params: unknown[] } {
  if (f.channel === "all") return { clause: "", params: [] };
  return { clause: " AND channel = $2", params: [f.channel] };
}

const REASON_COLORS = ["#c22222", "#d4af37", "#1f7a4d", "#3f8fe0", "#5fb87a", "#7a7a82"];

function splitHtml(s: ChannelSplit): string {
  const t = s.amazon + s.flipkart + s.shopify || 1;
  return `<b style="color:var(--color-amazon)">A ${Math.round((s.amazon / t) * 100)}%</b> · <b style="color:var(--color-flipkart)">F ${Math.round((s.flipkart / t) * 100)}%</b> · <b style="color:var(--color-shopify)">S ${Math.round((s.shopify / t) * 100)}%</b>`;
}

function mapStatus(raw: string | null): OrderRow["status"] {
  const s = (raw || "").toLowerCase();
  if (s.includes("deliver")) return "delivered";
  if (s.includes("ship") || s.includes("transit")) return s.includes("unship") ? "pending" : "transit";
  if (s.includes("cancel") || s.includes("return")) return "returned";
  return "pending";
}

export async function overviewKpis(f: Filter): Promise<Kpi[]> {
  const { clause, params } = ch(f);
  const row = await q1<{ rev: string; prev_rev: string; ord: string; prev_ord: string }>(
    `SELECT
       coalesce(sum(total_value) filter (where order_date >= now()-make_interval(days => $1::int)),0) rev,
       coalesce(sum(total_value) filter (where order_date <  now()-make_interval(days => $1::int)),0) prev_rev,
       count(*) filter (where order_date >= now()-make_interval(days => $1::int)) ord,
       count(*) filter (where order_date <  now()-make_interval(days => $1::int)) prev_ord
     FROM orders WHERE order_date >= now()-make_interval(days => 2 * $1::int) ${clause}`,
    [f.days, ...params],
  );
  const rev = +row.rev, prevRev = +row.prev_rev, ord = +row.ord, prevOrd = +row.prev_ord;
  const aov = ord ? rev / ord : 0, prevAov = prevOrd ? prevRev / prevOrd : 0;
  const split = await channelSplit(f);
  const ad = await q1<{ spend: string; sales: string }>(
    `SELECT coalesce(sum(spend),0) spend, coalesce(sum(attributed_sales),0) sales
     FROM ad_spend WHERE report_date >= now()::date - $1::int`,
    [f.days],
  );
  const acos = +ad.sales ? (+ad.spend / +ad.sales) * 100 : 0;
  const qs = buildQuery(f);
  return [
    { label: "Net Revenue", value: inrK(rev), deltaPct: deltaPct(rev, prevRev), splitHtml: splitHtml(split), href: `/drilldown/revenue${qs}` },
    { label: "Orders", value: num(ord), deltaPct: deltaPct(ord, prevOrd), splitHtml: splitHtml(split), href: `/drilldown/orders${qs}` },
    { label: "Avg Order Value", value: inr(aov), deltaPct: deltaPct(aov, prevAov), sub: "per order", href: `/drilldown/aov${qs}` },
    { label: "Blended ACOS", value: acos ? pct(acos) : "—", deltaPct: null, sub: "Amazon ads", href: `/drilldown/acos${qs}` },
  ];
}

/** Revenue drill-down: where every rupee came from, per SKU × channel. */
export async function revenueBySku(f: Filter): Promise<SkuRevenueRow[]> {
  const { clause, params } = ch(f);
  const rows = await q<{ sku: string; name: string; channel: Channel; units: string; orders: string; avg_price: string; revenue: string }>(
    `SELECT oi.internal_sku sku, sm.product_name name, o.channel,
       coalesce(sum(oi.qty),0) units, count(distinct o.order_id) orders,
       coalesce(avg(oi.unit_price),0) avg_price, coalesce(sum(oi.qty*oi.unit_price),0) revenue
     FROM order_items oi JOIN orders o USING(channel,order_id) JOIN sku_master sm ON sm.internal_sku=oi.internal_sku
     WHERE o.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o.channel")}
     GROUP BY oi.internal_sku, sm.product_name, o.channel
     ORDER BY revenue DESC`,
    [f.days, ...params],
  );
  return rows.map((r) => ({
    sku: r.sku, name: r.name, channel: r.channel,
    units: +r.units, orders: +r.orders, avgPrice: +r.avg_price, revenue: +r.revenue,
  }));
}

/** Orders drill-down: every order line in the window (capped for sanity). */
export async function orderLines(f: Filter, limit = 2000): Promise<OrderLineRow[]> {
  const { clause, params } = ch(f);
  const rows = await q<{ id: string; channel: Channel; date: string; sku: string; name: string; qty: string; price: string; region: string; status: string }>(
    `SELECT o.order_id id, o.channel, o.order_date date, oi.internal_sku sku, sm.product_name name,
       oi.qty, oi.unit_price price, o.buyer_region region, o.status
     FROM order_items oi JOIN orders o USING(channel,order_id) JOIN sku_master sm ON sm.internal_sku=oi.internal_sku
     WHERE o.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o.channel")}
     ORDER BY o.order_date DESC LIMIT ${Number(limit)}`,
    [f.days, ...params],
  );
  return rows.map((r) => ({
    id: r.id.startsWith("#") ? r.id : "#" + r.id,
    channel: r.channel,
    date: new Date(r.date).toISOString(),
    sku: r.sku,
    name: r.name,
    qty: +r.qty,
    price: +r.price,
    value: +r.qty * +r.price,
    region: r.region || "—",
    status: mapStatus(r.status),
  }));
}

export async function channelSplit(f: Filter): Promise<ChannelSplit> {
  const { clause, params } = ch(f);
  const rows = await q<{ channel: Channel; v: string }>(
    `SELECT channel, coalesce(sum(total_value),0) v FROM orders
     WHERE order_date >= now()-make_interval(days => $1::int) ${clause} GROUP BY channel`,
    [f.days, ...params],
  );
  const s: ChannelSplit = { amazon: 0, flipkart: 0, shopify: 0 };
  rows.forEach((r) => (s[r.channel] = +r.v));
  return s;
}

export async function trend(f: Filter): Promise<TrendPoint[]> {
  const rows = await q<{ label: string; amazon: string; flipkart: string; shopify: string }>(
    `SELECT to_char(d.day,'DD Mon') label,
       coalesce(sum(o.total_value) filter (where o.channel='amazon'),0) amazon,
       coalesce(sum(o.total_value) filter (where o.channel='flipkart'),0) flipkart,
       coalesce(sum(o.total_value) filter (where o.channel='shopify'),0) shopify
     FROM generate_series((now()-make_interval(days => $1::int))::date, now()::date, '1 day') d(day)
     LEFT JOIN orders o ON o.order_date::date = d.day
     GROUP BY d.day ORDER BY d.day`,
    [f.days],
  );
  return rows.map((r) => ({ label: r.label, amazon: +r.amazon, flipkart: +r.flipkart, shopify: +r.shopify }));
}

export async function ordersPerDay(f: Filter): Promise<TrendPoint[]> {
  const days = Math.min(f.days, 30);
  const rows = await q<{ label: string; amazon: string; flipkart: string; shopify: string }>(
    `SELECT to_char(d.day,'DD Mon') label,
       count(o.*) filter (where o.channel='amazon') amazon,
       count(o.*) filter (where o.channel='flipkart') flipkart,
       count(o.*) filter (where o.channel='shopify') shopify
     FROM generate_series((now()-make_interval(days => $1::int))::date, now()::date, '1 day') d(day)
     LEFT JOIN orders o ON o.order_date::date = d.day
     GROUP BY d.day ORDER BY d.day`,
    [days],
  );
  return rows.map((r) => ({ label: r.label, amazon: +r.amazon, flipkart: +r.flipkart, shopify: +r.shopify }));
}

export async function salesKpis(f: Filter): Promise<Kpi[]> {
  const { clause, params } = ch(f);
  const row = await q1<{ rev: string; prev_rev: string; ord: string; prev_ord: string; units: string; prev_units: string }>(
    `SELECT
       coalesce(sum(total_value) filter (where order_date >= now()-make_interval(days => $1::int)),0) rev,
       coalesce(sum(total_value) filter (where order_date <  now()-make_interval(days => $1::int)),0) prev_rev,
       count(*) filter (where order_date >= now()-make_interval(days => $1::int)) ord,
       count(*) filter (where order_date <  now()-make_interval(days => $1::int)) prev_ord,
       coalesce((select sum(qty) from order_items oi join orders o2 using(channel,order_id)
                 where o2.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o2.channel")}),0) units,
       coalesce((select sum(qty) from order_items oi join orders o2 using(channel,order_id)
                 where o2.order_date < now()-make_interval(days => $1::int) and o2.order_date >= now()-make_interval(days => 2 * $1::int) ${clause.replace("channel", "o2.channel")}),0) prev_units
     FROM orders WHERE order_date >= now()-make_interval(days => 2 * $1::int) ${clause}`,
    [f.days, ...params],
  );
  const rev = +row.rev, prevRev = +row.prev_rev, ord = +row.ord, prevOrd = +row.prev_ord;
  const units = +row.units, prevUnits = +row.prev_units;
  const aov = ord ? rev / ord : 0, prevAov = prevOrd ? prevRev / prevOrd : 0;
  const split = await channelSplit(f);
  const qs = buildQuery(f);
  return [
    { label: "Revenue", value: inrK(rev), deltaPct: deltaPct(rev, prevRev), splitHtml: splitHtml(split), href: `/drilldown/revenue${qs}` },
    { label: "Orders", value: num(ord), deltaPct: deltaPct(ord, prevOrd), splitHtml: splitHtml(split), href: `/drilldown/orders${qs}` },
    { label: "Units Sold", value: num(units), deltaPct: deltaPct(units, prevUnits), sub: "items", href: `/drilldown/revenue${qs}` },
    { label: "Avg Order Value", value: inr(aov), deltaPct: deltaPct(aov, prevAov), sub: "per order", href: `/drilldown/aov${qs}` },
  ];
}

export async function recentOrders(f: Filter, limit = 12): Promise<{ rows: OrderRow[]; total: number }> {
  const { clause, params } = ch(f);
  const rows = await q<{ id: string; channel: Channel; date: string; status: string; region: string; value: string; name: string; qty: string }>(
    `SELECT o.order_id id, o.channel, o.order_date date, o.status, o.buyer_region region, o.total_value value,
       coalesce(li.name,'—') name, coalesce(it.qty,0) qty
     FROM orders o
     LEFT JOIN LATERAL (SELECT sum(qty) qty FROM order_items WHERE channel=o.channel AND order_id=o.order_id) it ON true
     LEFT JOIN LATERAL (SELECT sm.product_name name FROM order_items oi JOIN sku_master sm ON sm.internal_sku=oi.internal_sku
                        WHERE oi.channel=o.channel AND oi.order_id=o.order_id ORDER BY oi.line_no LIMIT 1) li ON true
     WHERE o.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o.channel")}
     ORDER BY o.order_date DESC LIMIT ${Number(limit)}`,
    [f.days, ...params],
  );
  const cnt = await q1<{ n: string }>(
    `SELECT count(*) n FROM orders WHERE order_date >= now()-make_interval(days => $1::int) ${clause}`,
    [f.days, ...params],
  );
  return {
    total: +cnt.n,
    rows: rows.map((r) => ({
      id: r.id.startsWith("#") ? r.id : "#" + r.id,
      channel: r.channel,
      date: new Date(r.date).toISOString(),
      sku: "",
      name: r.name,
      qty: +r.qty,
      value: +r.value,
      region: r.region || "—",
      status: mapStatus(r.status),
    })),
  };
}

export async function topProducts(f: Filter, limit = 5): Promise<TopProduct[]> {
  const { clause, params } = ch(f);
  const rows = await q<{ name: string; value: string; units: string }>(
    `SELECT sm.product_name name, coalesce(sum(oi.qty*oi.unit_price),0) value, coalesce(sum(oi.qty),0) units
     FROM order_items oi JOIN orders o USING(channel,order_id) JOIN sku_master sm ON sm.internal_sku=oi.internal_sku
     WHERE o.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o.channel")}
     GROUP BY sm.product_name ORDER BY value DESC LIMIT ${Number(limit)}`,
    [f.days, ...params],
  );
  return rows.map((r) => ({ name: r.name, value: +r.value, units: +r.units, avgPrice: +r.units ? +r.value / +r.units : 0 }));
}

export async function stockHealth(f: Filter): Promise<StockRow[]> {
  const chCol = f.channel === "all" ? "" : " WHERE channel = $1";
  const params = f.channel === "all" ? [] : [f.channel];
  const rows = await q<{ sku: string; name: string; stock: string; fba: string; easyship: string; velocity: string }>(
    `SELECT internal_sku sku, product_name name, sum(available_qty) stock,
       sum(fba_qty) fba, sum(easyship_qty) easyship, sum(velocity) velocity
     FROM v_stock_health ${chCol} GROUP BY internal_sku, product_name`,
    params,
  );
  return rows
    .map((r) => {
      const stock = +r.stock, velocity = +r.velocity;
      const cover = velocity ? stock / velocity : 999;
      const status: StockRow["status"] = cover < 7 ? "critical" : cover < 14 ? "low" : "healthy";
      return { sku: r.sku, name: r.name, stock, fba: +r.fba, easyShip: +r.easyship, velocity, cover, status };
    })
    .sort((a, b) => a.cover - b.cover);
}

export async function inventoryKpis(f: Filter): Promise<Kpi[]> {
  const rows = await stockHealth(f);
  const crit = rows.filter((r) => r.status === "critical").length;
  const low = rows.filter((r) => r.status === "low").length;
  const total = rows.reduce((a, r) => a + r.stock, 0);
  const qs = buildQuery(f);
  const and = qs ? "&" : "?";
  return [
    { label: "SKUs Tracked", value: num(rows.length), sub: "live snapshot", href: `/drilldown/stock${qs}` },
    { label: "Critical", value: `<span style="color:var(--color-crimson-bright)">${crit}</span>`, sub: "< 7 days cover", href: `/drilldown/stock${qs}${and}status=critical` },
    { label: "Low Stock", value: `<span style="color:var(--color-gold-soft)">${low}</span>`, sub: "< 14 days cover", href: `/drilldown/stock${qs}${and}status=low` },
    { label: "Units On Hand", value: num(total), sub: "total inventory", href: `/drilldown/stock${qs}` },
  ];
}

export async function advertisingKpis(): Promise<Kpi[]> {
  const r = await q1<{ spend: string; sales: string; waste: string }>(
    `SELECT coalesce(sum(spend),0) spend, coalesce(sum(attributed_sales),0) sales,
            coalesce(sum(spend) filter (where orders=0),0) waste FROM ad_spend`,
  );
  const spend = +r.spend, sales = +r.sales, waste = +r.waste;
  const acos = sales ? (spend / sales) * 100 : 0;
  return [
    { label: "Ad Spend", value: inrK(spend), sub: "Amazon" },
    { label: "Ad Sales", value: inrK(sales), sub: "attributed" },
    { label: "ACOS", value: acos ? pct(acos) : "—", sub: "target 28%" },
    { label: "Wasted Spend", value: `<span style="color:var(--color-crimson-bright)">${inrK(waste)}</span>`, sub: "zero-order terms" },
  ];
}

export async function campaigns(): Promise<CampaignRow[]> {
  const rows = await q<{ name: string; spend: string; sales: string; clicks: string; orders: string }>(
    `SELECT campaign name, sum(spend) spend, sum(attributed_sales) sales, sum(clicks) clicks, sum(orders) orders
     FROM ad_spend GROUP BY campaign ORDER BY sum(spend) DESC`,
  );
  return rows.map((r) => ({
    name: r.name, spend: +r.spend, sales: +r.sales, clicks: +r.clicks, orders: +r.orders,
    acos: +r.sales ? (+r.spend / +r.sales) * 100 : 0,
  })).sort((a, b) => b.acos - a.acos);
}

export async function wasted(): Promise<WastedRow[]> {
  const rows = await q<{ term: string; spend: string; clicks: string; orders: string }>(
    `SELECT keyword_or_search_term term, spend, clicks, orders FROM v_wasted_spend`,
  );
  return rows.map((r) => ({ term: r.term, spend: +r.spend, clicks: +r.clicks, orders: +r.orders }));
}

/**
 * SKU-wise returns for the selected window & channel. Rate divides returned
 * units by units SOLD IN THE SAME WINDOW — a matched-window rate, so the
 * 7/30/90D toggle actually changes it. Top reason is quantity-weighted and
 * windowed too.
 */
export async function returns(f: Filter): Promise<ReturnRow[]> {
  const { clause, params } = ch(f);
  const rows = await q<{ sku: string; name: string; units: string; sold: string; reason: string | null }>(
    `WITH ret AS (
       SELECT internal_sku, sum(qty) units
       FROM returns WHERE return_date >= (now()-make_interval(days => $1::int))::date ${clause}
       GROUP BY internal_sku
     ), sold AS (
       SELECT oi.internal_sku, sum(oi.qty) units
       FROM order_items oi JOIN orders o USING(channel,order_id)
       WHERE o.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o.channel")}
       GROUP BY oi.internal_sku
     ), reason AS (
       SELECT DISTINCT ON (internal_sku) internal_sku, reason FROM (
         SELECT internal_sku, coalesce(reason,'Unspecified') reason, sum(qty) n
         FROM returns WHERE return_date >= (now()-make_interval(days => $1::int))::date ${clause}
         GROUP BY internal_sku, coalesce(reason,'Unspecified')
       ) x ORDER BY internal_sku, n DESC
     )
     SELECT r.internal_sku sku, sm.product_name name, r.units, coalesce(s.units,0) sold, re.reason
     FROM ret r
     JOIN sku_master sm ON sm.internal_sku = r.internal_sku
     LEFT JOIN sold s ON s.internal_sku = r.internal_sku
     LEFT JOIN reason re ON re.internal_sku = r.internal_sku`,
    [f.days, ...params],
  );
  return rows
    .map((r) => ({
      sku: r.sku,
      name: r.name,
      units: +r.units,
      sold: +r.sold,
      rate: +r.sold > 0 ? (+r.units / +r.sold) * 100 : 0,
      reason: r.reason || "—",
    }))
    .sort((a, b) => b.rate - a.rate);
}

/** Minimum window sales for a SKU to qualify for the "highest rate" headline —
    1 return on 2 sold is 50% but means nothing. */
const RATE_MIN_SOLD = 3;

export async function returnsKpis(f: Filter): Promise<Kpi[]> {
  const { clause, params } = ch(f);
  const totals = await q1<{ returned: string; sold: string }>(
    `SELECT
       (SELECT coalesce(sum(qty),0) FROM returns
        WHERE return_date >= (now()-make_interval(days => $1::int))::date ${clause}) returned,
       (SELECT coalesce(sum(oi.qty),0) FROM order_items oi JOIN orders o USING(channel,order_id)
        WHERE o.order_date >= now()-make_interval(days => $1::int) ${clause.replace("channel", "o.channel")}) sold`,
    [f.days, ...params],
  );
  const returned = +totals.returned, sold = +totals.sold;
  const accountRate = sold > 0 ? (returned / sold) * 100 : 0;
  const data = await returns(f);
  const topByUnits = [...data].sort((a, b) => b.units - a.units)[0];
  const worst = data.filter((d) => d.sold >= RATE_MIN_SOLD)[0];
  const reasons = await returnReasons(f);
  const qs = buildQuery(f);
  const and = qs ? "&" : "?";
  return [
    { label: "Account Return Rate", value: sold ? pct(accountRate) : "—", sub: `${num(returned)} of ${num(sold)} units sold`, href: `/drilldown/returns${qs}` },
    { label: "Units Returned", value: num(returned), sub: `last ${f.days} days`, href: `/drilldown/returns${qs}` },
    { label: "Top SKU Returns", value: topByUnits ? num(topByUnits.units) : "—", sub: topByUnits ? topByUnits.sku : "no returns in window", href: topByUnits ? `/drilldown/returns${qs}${and}q=${encodeURIComponent(topByUnits.sku)}` : `/drilldown/returns${qs}` },
    { label: "Highest Return Rate", value: worst ? worst.rate.toFixed(1) + "%" : "—", sub: worst ? `${worst.sku} · ≥${RATE_MIN_SOLD} sold` : `no SKU with ≥${RATE_MIN_SOLD} sold`, href: worst ? `/drilldown/returns${qs}${and}q=${encodeURIComponent(worst.sku)}` : `/drilldown/returns${qs}` },
  ];
}

/** Returns drill-down: every individual return event in the window. */
export async function returnLines(f: Filter, limit = 2000): Promise<ReturnLineRow[]> {
  const { clause, params } = ch(f);
  const rows = await q<{ id: string; channel: Channel; date: string; sku: string; name: string | null; qty: string; reason: string | null }>(
    `SELECT r.return_id id, r.channel, r.return_date date, r.internal_sku sku,
       sm.product_name name, r.qty, r.reason
     FROM returns r LEFT JOIN sku_master sm ON sm.internal_sku = r.internal_sku
     WHERE r.return_date >= (now()-make_interval(days => $1::int))::date ${clause.replace("channel", "r.channel")}
     ORDER BY r.return_date DESC LIMIT ${Number(limit)}`,
    [f.days, ...params],
  );
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    date: new Date(r.date).toISOString(),
    sku: r.sku,
    name: r.name || r.sku,
    qty: +r.qty,
    reason: r.reason || "Unspecified",
  }));
}

export async function returnReasons(f: Filter): Promise<ReturnReason[]> {
  const { clause, params } = ch(f);
  const rows = await q<{ reason: string; n: string }>(
    `SELECT coalesce(reason,'Unspecified') reason, sum(qty) n FROM returns
     WHERE return_date >= (now()-make_interval(days => $1::int))::date ${clause}
     GROUP BY coalesce(reason,'Unspecified') ORDER BY n DESC LIMIT 6`,
    [f.days, ...params],
  );
  const total = rows.reduce((a, r) => a + +r.n, 0) || 1;
  return rows.map((r, i) => ({ reason: r.reason, share: Math.round((+r.n / total) * 100), color: REASON_COLORS[i % REASON_COLORS.length] }));
}

export async function products(): Promise<ProductRow[]> {
  const rows = await q<{
    sku: string; name: string; cost: string; az: string; fk: string; sh: string; stock: string; avg_price: string;
  }>(
    `SELECT sm.internal_sku sku, sm.product_name name, sm.cost_price cost,
       coalesce(sum(oi.qty) filter (where o.channel='amazon'   and o.order_date>=now()-interval '30 days'),0)/30.0 az,
       coalesce(sum(oi.qty) filter (where o.channel='flipkart'  and o.order_date>=now()-interval '30 days'),0)/30.0 fk,
       coalesce(sum(oi.qty) filter (where o.channel='shopify'   and o.order_date>=now()-interval '30 days'),0)/30.0 sh,
       coalesce((SELECT sum(available_qty) FROM v_inventory_latest il WHERE il.internal_sku=sm.internal_sku),0) stock,
       coalesce(avg(oi.unit_price),0) avg_price
     FROM sku_master sm
     LEFT JOIN order_items oi ON oi.internal_sku=sm.internal_sku
     LEFT JOIN orders o USING(channel,order_id)
     GROUP BY sm.internal_sku, sm.product_name, sm.cost_price
     ORDER BY (coalesce(sum(oi.qty),0)) DESC`,
  );
  return rows.map((r) => {
    const vels: [Channel, number][] = [["amazon", +r.az], ["flipkart", +r.fk], ["shopify", +r.sh]];
    const best = vels.sort((a, b) => b[1] - a[1])[0][0];
    const avgPrice = +r.avg_price, cost = +r.cost;
    const margin = avgPrice > 0 ? ((avgPrice - cost) / avgPrice) * 100 : 0;
    return {
      sku: r.sku, name: r.name, amazonVel: +r.az, flipkartVel: +r.fk, shopifyVel: +r.sh,
      marginPct: margin, totalStock: +r.stock, bestChannel: best,
    };
  });
}

export async function decisions(f: Filter): Promise<Decision[]> {
  const list: Decision[] = [];
  const stock = await stockHealth({ channel: "all", days: f.days });
  stock.filter((s) => s.cover < 10 && s.velocity > 0).slice(0, 4).forEach((s) => {
    list.push({
      icon: "box", title: `Stockout risk · ${s.name}`, severity: "high", severityLabel: "High",
      body: `Only ${Math.round(s.cover)} days of cover at current velocity (${s.velocity.toFixed(1)} units/day). Reorder before it hits zero.`,
      ask: `Plan a restock for ${s.sku} — how many units to order to cover 45 days plus a Diwali buffer?`,
    });
  });
  const w = await wasted();
  if (w.length) {
    const total = w.filter((x) => x.orders === 0).reduce((a, x) => a + x.spend, 0);
    list.push({
      icon: "coin", title: "Wasted ad spend detected", severity: "high", severityLabel: "High", channel: "amazon",
      body: `${inr(total)} on ${w.filter((x) => x.orders === 0).length} search terms with zero orders. Add as negative keywords.`,
      ask: "List the exact negative keywords to add and the campaigns to add them to, with estimated monthly savings.",
    });
  }
  const rr = await returns(f);
  if (rr.length) {
    list.push({
      icon: "rotate", title: `Return-rate spike · ${rr[0].name}`, severity: "med", severityLabel: "Medium",
      body: `${rr[0].rate.toFixed(1)}% return rate — top reason "${rr[0].reason}". Investigate packaging / listing accuracy.`,
      ask: `Break down returns for ${rr[0].sku} by reason and channel and suggest fixes.`,
    });
  }
  return list;
}

export async function decisionCount(): Promise<number> {
  return (await decisions({ channel: "all", days: 30 })).length;
}

function ago(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function syncStatus(): Promise<SyncStatus | null> {
  const rows = await q<{ last_synced_at: string | null; last_status: string | null }>(
    `SELECT last_synced_at, last_status FROM sync_state WHERE last_synced_at IS NOT NULL`,
  );
  if (!rows.length) return null;
  const latest = new Date(Math.max(...rows.map((r) => new Date(r.last_synced_at!).getTime())));
  const anyError = rows.some((r) => r.last_status && r.last_status !== "ok");
  const stale = Date.now() - latest.getTime() > 6 * 3_600_000; // ETL runs every 3h
  return { label: ago(latest), ok: !anyError && !stale };
}
