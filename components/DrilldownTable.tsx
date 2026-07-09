"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toCsv, todayStamp } from "@/lib/exports";
import { inr, num, dayLabel, channelName } from "@/lib/format";
import { ChannelChip, StatusPill } from "@/components/ui";
import DownloadCsv from "@/components/DownloadCsv";
import type { Channel } from "@/lib/types";

/*
  Generic drill-down table: client-side search, per-column value filters,
  sortable headers, totals row, and CSV export of exactly what is on
  screen (filtered + sorted). Rows/columns come from the server page, so
  the same component serves revenue, orders, AOV and ACOS drill-downs.
*/

export type CellKind = "text" | "money" | "int" | "float" | "pct" | "channel" | "status" | "date" | "rating";

const NUMERIC: CellKind[] = ["money", "int", "float", "pct", "rating"];

export interface DrillCol {
  key: string;
  label: string;
  kind?: CellKind;
  /** render a distinct-value dropdown filter for this column */
  filter?: boolean;
  /** include in the free-text search (defaults to all text/channel/status cols) */
  strong?: boolean;
  /** sum this column in the totals row */
  total?: boolean;
}

type Row = Record<string, string | number>;
type SortDir = "asc" | "desc";

const DISPLAY_CAP = 200;

function fmt(v: string | number, kind: CellKind): string {
  switch (kind) {
    case "money": return inr(Number(v));
    case "int": return num(Number(v));
    case "float": return Number(v).toFixed(1);
    case "pct": return Number(v).toFixed(1) + "%";
    case "rating": return Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 1) + "★";
    case "date": return dayLabel(String(v));
    case "channel": return channelName(String(v));
    default: return String(v);
  }
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" title={`${value.toFixed(1)} of 5`} aria-label={`${value.toFixed(1)} of 5 stars`}>
      {"★".repeat(full)}
      <span className="stars-off">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function csvValue(v: string | number, kind: CellKind): string | number {
  if (kind === "money" || kind === "pct" || kind === "float" || kind === "rating") return Math.round(Number(v) * 100) / 100;
  if (kind === "int") return Number(v);
  if (kind === "date") return String(v).slice(0, 10);
  if (kind === "channel") return channelName(String(v));
  return String(v);
}

export default function DrilldownTable({
  rows,
  cols,
  filename,
  initialSort,
  initialSearch = "",
  initialPicks,
  linkTo,
}: {
  rows: Row[];
  cols: DrillCol[];
  filename: string; // base name, no extension
  initialSort?: { key: string; dir: SortDir };
  /** pre-fill the free-text search (e.g. deep link to one SKU) */
  initialSearch?: string;
  /** pre-select column filters (e.g. { status: "critical" }) */
  initialPicks?: Record<string, string>;
  /** make each row navigate to `${base}/${row[key]}` keeping the global filters */
  linkTo?: { base: string; key: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [qText, setQText] = useState(initialSearch);
  const [picks, setPicks] = useState<Record<string, string>>(initialPicks ?? {});
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort ?? null);
  const [showAll, setShowAll] = useState(false);

  const filterCols = cols.filter((c) => c.filter);
  const searchKeys = cols
    .filter((c) => !c.kind || c.kind === "text" || c.kind === "channel" || c.kind === "status")
    .map((c) => c.key);

  const filtered = useMemo(() => {
    const needle = qText.trim().toLowerCase();
    let out = rows;
    if (needle) out = out.filter((r) => searchKeys.some((k) => String(r[k]).toLowerCase().includes(needle)));
    for (const [k, v] of Object.entries(picks)) {
      if (v) out = out.filter((r) => String(r[k]) === v);
    }
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      const numeric = col && NUMERIC.includes(col.kind || "text");
      out = [...out].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        const cmp = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, qText, picks, sort, cols, searchKeys]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    cols.forEach((c) => {
      if (c.total) t[c.key] = filtered.reduce((a, r) => a + Number(r[c.key] || 0), 0);
    });
    return t;
  }, [filtered, cols]);
  const hasTotals = cols.some((c) => c.total);

  const csv = useMemo(
    () =>
      toCsv(
        cols.map((c) => c.label),
        filtered.map((r) => cols.map((c) => csvValue(r[c.key], c.kind || "text"))),
      ),
    [filtered, cols],
  );

  const visible = showAll ? filtered : filtered.slice(0, DISPLAY_CAP);

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  function distinct(key: string): string[] {
    return [...new Set(rows.map((r) => String(r[key])))].sort();
  }

  const align = (c: DrillCol) => (NUMERIC.includes(c.kind || "text") ? "right" : undefined);

  function rowHref(r: Row): string | undefined {
    if (!linkTo) return undefined;
    const id = String(r[linkTo.key] ?? "");
    if (!id) return undefined;
    // keep only the global filters when jumping to a detail page
    const p = new URLSearchParams();
    for (const k of ["channel", "days", "from", "to"] as const) {
      const v = searchParams.get(k);
      if (v) p.set(k, v);
    }
    const qs = p.toString();
    return `${linkTo.base}/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      <div className="drill-toolbar">
        <div className="drill-search">
          <Search size={14} />
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Search SKU, product, order…"
            aria-label="Search rows"
          />
        </div>
        {filterCols.map((c) => (
          <select
            key={c.key}
            className="drill-select"
            value={picks[c.key] || ""}
            onChange={(e) => setPicks((p) => ({ ...p, [c.key]: e.target.value }))}
            aria-label={`Filter by ${c.label}`}
          >
            <option value="">{c.label}: all</option>
            {distinct(c.key).map((v) => (
              <option key={v} value={v}>
                {c.kind === "channel" ? channelName(v) : v}
              </option>
            ))}
          </select>
        ))}
        <div className="spacer" />
        <span className="tiny muted">
          {num(filtered.length)} of {num(rows.length)} rows
        </span>
        <DownloadCsv
          csv={csv}
          filename={`${filename}-${todayStamp()}.csv`}
          label="Download CSV"
          disabled={!filtered.length}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={align(c)}>
                  <button type="button" className="th-sort" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    {sort?.key === c.key ? (
                      sort.dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />
                    ) : (
                      <ArrowUpDown size={11} className="dim" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const href = rowHref(r);
              return (
              <tr
                key={i}
                className={href ? "rowlink" : undefined}
                title={href ? "Open product detail" : undefined}
                onClick={href ? () => router.push(href) : undefined}
              >
                {cols.map((c) => {
                  const kind = c.kind || "text";
                  if (kind === "channel")
                    return (
                      <td key={c.key}>
                        <ChannelChip channel={String(r[c.key]) as Channel} />
                      </td>
                    );
                  if (kind === "status")
                    return (
                      <td key={c.key}>
                        <StatusPill status={String(r[c.key])} />
                      </td>
                    );
                  if (kind === "rating")
                    return (
                      <td key={c.key} className="right">
                        <Stars value={Number(r[c.key])} />
                      </td>
                    );
                  const numeric = NUMERIC.includes(kind);
                  return (
                    <td
                      key={c.key}
                      className={[numeric ? "right num" : "", c.strong ? "strong" : "", kind === "text" ? "truncate-cell" : "", kind === "date" ? "tiny" : ""].join(" ").trim()}
                    >
                      {fmt(r[c.key], kind)}
                    </td>
                  );
                })}
              </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={cols.length}>
                  <div className="empty">No rows match the current filters</div>
                </td>
              </tr>
            )}
          </tbody>
          {hasTotals && filtered.length > 0 && (
            <tfoot>
              <tr>
                {cols.map((c, i) => (
                  <td key={c.key} className={c.total ? "right num strong" : "tiny muted"}>
                    {c.total ? fmt(totals[c.key], c.kind === "money" ? "money" : "int") : i === 0 ? "Total (filtered)" : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {!showAll && filtered.length > DISPLAY_CAP && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={() => setShowAll(true)}>
            Show all {num(filtered.length)} rows
          </button>
        </div>
      )}
    </div>
  );
}
