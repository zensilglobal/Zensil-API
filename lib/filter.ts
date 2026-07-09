import { ChannelFilter, Filter, RangeDays } from "./types";

const CHANNELS: ChannelFilter[] = ["all", "amazon", "flipkart", "shopify"];
export const RANGES: RangeDays[] = [7, 15, 30, 90];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_CUSTOM_DAYS = 366;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFilter(searchParams: Record<string, string | string[] | undefined>): Filter {
  const chRaw = one(searchParams.channel);
  const channel = CHANNELS.includes(chRaw as ChannelFilter) ? (chRaw as ChannelFilter) : "all";

  // custom window (?from=YYYY-MM-DD&to=YYYY-MM-DD) beats the preset ranges
  const from = one(searchParams.from);
  const to = one(searchParams.to);
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
    const span = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
    if (span <= MAX_CUSTOM_DAYS) return { channel, days: span, from, to };
  }

  const daysNum = Number(one(searchParams.days));
  const days = RANGES.includes(daysNum as RangeDays) ? daysNum : 30;
  return { channel, days };
}

export function buildQuery(f: Partial<Filter>): string {
  const p = new URLSearchParams();
  if (f.channel && f.channel !== "all") p.set("channel", f.channel);
  if (f.from && f.to) {
    p.set("from", f.from);
    p.set("to", f.to);
  } else if (f.days && f.days !== 30) {
    p.set("days", String(f.days));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Resolved half-open date window [start, endEx) plus the equal-length window before it. */
export interface DateWindow {
  start: string; // inclusive, yyyy-mm-dd
  endEx: string; // exclusive, yyyy-mm-dd
  prevStart: string; // start of the comparison window (ends at `start`)
  days: number;
}

/**
 * Turn a Filter into concrete dates. Preset ranges anchor at `anchor`
 * (today in production; the sample data's BASE date in demo mode) so
 * "7D" means the last 7 calendar days including today.
 */
export function windowOf(f: Filter, anchor: Date = new Date()): DateWindow {
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  if (f.from && f.to) {
    const start = Date.parse(f.from + "T00:00:00Z");
    const endEx = Date.parse(f.to + "T00:00:00Z") + DAY_MS;
    const days = Math.max(1, Math.round((endEx - start) / DAY_MS));
    return { start: iso(start), endEx: iso(endEx), prevStart: iso(start - days * DAY_MS), days };
  }
  const endEx = Math.floor(anchor.getTime() / DAY_MS) * DAY_MS + DAY_MS; // tomorrow 00:00 UTC
  const start = endEx - f.days * DAY_MS;
  return { start: iso(start), endEx: iso(endEx), prevStart: iso(start - f.days * DAY_MS), days: f.days };
}

const nice = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Human label for the active window — "last 30 days" or "01 Jun – 15 Jun 2026". */
export function windowLabel(f: Filter): string {
  if (f.from && f.to) return f.from === f.to ? nice(f.from) : `${nice(f.from)} – ${nice(f.to)}`;
  return `last ${f.days} days`;
}
