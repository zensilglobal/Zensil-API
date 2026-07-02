import Link from "next/link";
import { Package, Coins, Target, RotateCw, Info, Sparkles } from "lucide-react";
import { Decision, Filter } from "@/lib/types";
import { ChannelChip } from "./ui";

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  box: Package,
  coin: Coins,
  target: Target,
  rotate: RotateCw,
  info: Info,
};

export function askHref(ask: string, f: Filter): string {
  const p = new URLSearchParams();
  p.set("q", ask);
  if (f.channel !== "all") p.set("channel", f.channel);
  if (f.days !== 30) p.set("days", String(f.days));
  return `/insights?${p.toString()}`;
}

export function DecisionCard({ d, filter }: { d: Decision; filter: Filter }) {
  const Icon = ICONS[d.icon] ?? Info;
  return (
    <div className="decision">
      <div className="ic">
        <Icon size={20} />
      </div>
      <div style={{ flex: 1 }}>
        <h4>
          {d.title}
          <span className={`sev ${d.severity}`}>{d.severityLabel}</span>
          {d.channel && <ChannelChip channel={d.channel} />}
        </h4>
        <p>{d.body}</p>
        <div className="act">
          <Link className="btn ghost" href={askHref(d.ask, filter)}>
            <Sparkles size={15} /> Ask Claude
          </Link>
        </div>
      </div>
    </div>
  );
}
