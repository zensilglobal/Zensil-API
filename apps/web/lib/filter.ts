import { ChannelFilter, Filter, RangeDays } from "./types";

const CHANNELS: ChannelFilter[] = ["all", "amazon", "flipkart", "shopify"];
const RANGES: RangeDays[] = [7, 30, 90];

export function parseFilter(searchParams: Record<string, string | string[] | undefined>): Filter {
  const chRaw = Array.isArray(searchParams.channel) ? searchParams.channel[0] : searchParams.channel;
  const dRaw = Array.isArray(searchParams.days) ? searchParams.days[0] : searchParams.days;
  const channel = CHANNELS.includes(chRaw as ChannelFilter) ? (chRaw as ChannelFilter) : "all";
  const daysNum = Number(dRaw);
  const days = (RANGES.includes(daysNum as RangeDays) ? daysNum : 30) as RangeDays;
  return { channel, days };
}

export function buildQuery(f: Partial<Filter>): string {
  const p = new URLSearchParams();
  if (f.channel && f.channel !== "all") p.set("channel", f.channel);
  if (f.days && f.days !== 30) p.set("days", String(f.days));
  const s = p.toString();
  return s ? `?${s}` : "";
}
