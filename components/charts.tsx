"use client";
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
} from "recharts";
import { TrendPoint, ChannelFilter, ChannelSplit } from "@/lib/types";
import { inrK, inr } from "@/lib/format";

const COLORS = { amazon: "#d4af37", flipkart: "#3f8fe0", shopify: "#5fb87a" };
const GRID = "rgba(255,255,255,.05)";
const TICK = "#8a857c";

const tooltipStyle = {
  background: "#111114",
  border: "1px solid rgba(212,175,55,.32)",
  borderRadius: 10,
  fontSize: 12,
  color: "#f3efe6",
};

function activeChannels(channel: ChannelFilter): (keyof typeof COLORS)[] {
  if (channel === "all") return ["amazon", "flipkart", "shopify"];
  return [channel as keyof typeof COLORS];
}

export function RevenueTrend({ data, channel }: { data: TrendPoint[]; channel: ChannelFilter }) {
  const chans = activeChannels(channel);
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => inr(Number(v))} labelStyle={{ color: "#a9a39a" }} />
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
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis stroke={TICK} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(212,175,55,.05)" }} labelStyle={{ color: "#a9a39a" }} />
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
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="#0c0c0e" strokeWidth={3}>
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
          <Pie data={data} dataKey="share" nameKey="reason" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="#0c0c0e" strokeWidth={3}>
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
