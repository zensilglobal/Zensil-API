"use client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  type MouseHandlerDataParam,
} from "recharts";
import { TrendPoint, ChannelFilter, ChannelSplit } from "@/lib/types";
import { inrK, inr } from "@/lib/format";

/**
 * Chart-level click → that day's order lines in the drill-down, keeping the
 * current channel/period query string. Recharts v3 hands back the active
 * point's index, which we resolve against the chart's own data.
 */
function useDayDrill(data: TrendPoint[]) {
  const router = useRouter();
  const sp = useSearchParams();
  return (st: MouseHandlerDataParam) => {
    const i = Number(st?.activeIndex);
    const date = Number.isInteger(i) ? data[i]?.date : undefined;
    if (!date) return;
    const p = new URLSearchParams(sp.toString());
    p.set("date", date);
    router.push(`/drilldown/orders?${p.toString()}`);
  };
}

/* All chart colors resolve from CSS custom properties so the palette
   follows the active light/dark theme (SVG fill/stroke accept var()). */
const COLORS = {
  amazon: "var(--color-amazon)",
  flipkart: "var(--color-flipkart)",
  shopify: "var(--color-shopify)",
};
const GRID = "var(--chart-grid)";
const TICK = "var(--chart-tick)";

const tooltipStyle = {
  background: "var(--tooltip-bg)",
  border: "1px solid var(--line-strong)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--text)",
  boxShadow: "var(--shadow)",
};
const tooltipLabel = { color: "var(--text-dim)" };

function activeChannels(channel: ChannelFilter): (keyof typeof COLORS)[] {
  if (channel === "all") return ["amazon", "flipkart", "shopify"];
  return [channel as keyof typeof COLORS];
}

export function RevenueTrend({ data, channel }: { data: TrendPoint[]; channel: ChannelFilter }) {
  const chans = activeChannels(channel);
  const dayDrill = useDayDrill(data);
  return (
    <div style={{ height: 260, cursor: "pointer" }} title="Click a day to see its orders">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={dayDrill}>
          <defs>
            {chans.map((c) => (
              <linearGradient key={c} id={`g-${c}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[c]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS[c]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => inrK(v)} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} labelStyle={tooltipLabel} />
          {chans.map((c) => (
            <Area key={c} type="monotone" dataKey={c} name={c[0].toUpperCase() + c.slice(1)} stroke={COLORS[c]} strokeWidth={2} fill={`url(#g-${c})`} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OrdersBar({ data, channel }: { data: TrendPoint[]; channel: ChannelFilter }) {
  const chans = activeChannels(channel);
  const dayDrill = useDayDrill(data);
  return (
    <div style={{ height: 260, cursor: "pointer" }} title="Click a day to see its orders">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={dayDrill}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--chart-cursor)" }} labelStyle={tooltipLabel} />
          {chans.map((c) => (
            <Bar key={c} dataKey={c} name={c[0].toUpperCase() + c.slice(1)} stackId="s" fill={COLORS[c]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChannelDonut({ split }: { split: ChannelSplit }) {
  const data = [
    { name: "Amazon", value: split.amazon, color: COLORS.amazon },
    { name: "Flipkart", value: split.flipkart, color: COLORS.flipkart },
    { name: "Shopify", value: split.shopify, color: COLORS.shopify },
  ].filter((d) => d.value > 0);
  return (
    <div style={{ height: 210 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="var(--donut-stroke)" strokeWidth={3}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ReasonsDonut({ data }: { data: { reason: string; share: number; color: string }[] }) {
  return (
    <div style={{ height: 210 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="share" nameKey="reason" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="var(--donut-stroke)" strokeWidth={3}>
            {data.map((d) => (
              <Cell key={d.reason} fill={d.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v)}%`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
