import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Kpi, Channel } from "@/lib/types";
import { channelName } from "@/lib/format";

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid g-4">
      {kpis.map((k) => (
        <KpiCard key={k.label} kpi={k} />
      ))}
    </div>
  );
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const d = kpi.deltaPct;
  const inner = (
    <>
      {kpi.href && (
        <span className="kpi-go">
          <ArrowUpRight size={14} />
        </span>
      )}
      <div className="lab">{kpi.label}</div>
      <div className="val" dangerouslySetInnerHTML={{ __html: kpi.value }} />
      <div className="meta">
        {d !== null && d !== undefined && (
          <span className={`delta ${d >= 0 ? "up" : "down"}`}>
            {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%
          </span>
        )}
        {kpi.splitHtml ? (
          <span className="split-mini" dangerouslySetInnerHTML={{ __html: kpi.splitHtml }} />
        ) : (
          <span className="split-mini">{kpi.sub}</span>
        )}
      </div>
    </>
  );
  return kpi.href ? (
    <Link href={kpi.href} className="kpi kpi-link" aria-label={`${kpi.label} — view detail`}>
      {inner}
    </Link>
  ) : (
    <div className="kpi">{inner}</div>
  );
}

export function ChannelChip({ channel }: { channel: Channel }) {
  return (
    <span className={`chip ${channel}`}>
      <span className="swatch" />
      {channelName(channel)}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${status}`}>{status}</span>;
}

export function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
    </div>
  );
}

export function Card({
  title,
  sub,
  children,
  action,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-h">
          {title && (
            <div>
              <h3>{title}</h3>
              {sub && <div className="sub">{sub}</div>}
            </div>
          )}
          <div className="spacer" />
          {action}
        </div>
      )}
      <div className="card-b">{children}</div>
    </div>
  );
}
