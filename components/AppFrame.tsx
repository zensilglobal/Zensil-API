"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  LayoutGrid,
  ShoppingCart,
  Package,
  Target,
  RotateCw,
  Layers,
  Sparkles,
  Menu,
} from "lucide-react";
import { ChannelFilter, RangeDays, SyncStatus } from "@/lib/types";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid, group: "Command" },
  { href: "/sales", label: "Sales & Orders", icon: ShoppingCart, group: "Command" },
  { href: "/inventory", label: "Inventory", icon: Package, group: "Command", badgeKey: "inventory" },
  { href: "/advertising", label: "Advertising", icon: Target, group: "Command", badgeKey: "advertising" },
  { href: "/returns", label: "Returns", icon: RotateCw, group: "Command" },
  { href: "/products", label: "Products", icon: Layers, group: "Command" },
  { href: "/insights", label: "Claude Insights", icon: Sparkles, group: "Intelligence", badgeKey: "insights" },
] as const;

const TITLES: Record<string, { t: string; s: string }> = {
  "/": { t: "Overview", s: "Headline performance across all channels" },
  "/sales": { t: "Sales & Orders", s: "Revenue, orders and fulfilment status" },
  "/inventory": { t: "Inventory", s: "Stock health & stockout forecasting" },
  "/advertising": { t: "Advertising", s: "Amazon campaign performance & wasted spend" },
  "/returns": { t: "Returns", s: "Return-rate outliers & reasons" },
  "/products": { t: "Products", s: "Cross-channel SKU master" },
  "/insights": { t: "Claude Insights", s: "Ask plain-English questions over live data" },
};

const CHANNELS: { id: ChannelFilter; label: string; color?: string }[] = [
  { id: "all", label: "All" },
  { id: "amazon", label: "Amazon", color: "var(--color-amazon)" },
  { id: "flipkart", label: "Flipkart", color: "var(--color-flipkart)" },
  { id: "shopify", label: "Shopify", color: "var(--color-shopify)" },
];
const RANGES: RangeDays[] = [7, 30, 90];

export default function AppFrame({
  children,
  badges,
  sync,
}: {
  children: React.ReactNode;
  badges: Record<string, number>;
  sync: SyncStatus | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Live dashboard: re-fetch all server data every 60s (only while the tab
  // is visible) so new orders appear without a manual reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  const channel = (searchParams.get("channel") as ChannelFilter) || "all";
  const days = (Number(searchParams.get("days")) || 30) as RangeDays;
  const title = TITLES[pathname] ?? { t: "Zensil Ops", s: "" };

  function withParam(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString());
    if ((key === "channel" && value === "all") || (key === "days" && value === "30")) p.delete(key);
    else p.set(key, value);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function navHref(href: string) {
    const qs = searchParams.toString();
    return qs ? `${href}?${qs}` : href;
  }

  return (
    <div className="app">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <div className="crest">
            <div className="mark">Z</div>
            <div className="word">
              <b>ZENSIL</b>
              <span>Ops Console</span>
            </div>
          </div>
        </div>
        <nav className="nav">
          {["Command", "Intelligence"].map((group) => (
            <div key={group}>
              <div className="nav-label">{group}</div>
              {NAV.filter((n) => n.group === group).map((n) => {
                const Icon = n.icon;
                const active = pathname === n.href;
                const badge = "badgeKey" in n && n.badgeKey ? badges[n.badgeKey] : undefined;
                return (
                  <Link
                    key={n.href}
                    href={navHref(n.href)}
                    className={`nav-item ${active ? "active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <Icon />
                    <span>{n.label}</span>
                    {badge ? <span className="badge">{badge}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sync-pill">
            <span className="dot" style={sync && !sync.ok ? { background: "var(--color-gold-soft)" } : undefined} />{" "}
            {sync ? `Warehouse synced · ${sync.label}` : "Sample data"}
          </div>
          <div className="flex between" style={{ marginTop: 4 }}>
            <span className="tiny muted">Amazon · Flipkart · Shopify</span>
            <form action="/api/logout" method="post">
              <button type="submit" className="tiny muted" style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
            <Menu size={18} />
          </button>
          <div className="page-title">
            <h1>{title.t}</h1>
            <p>{title.s}</p>
          </div>
          <div className="spacer" />
          <div className="seg">
            {CHANNELS.map((c) => (
              <button key={c.id} className={channel === c.id ? "on" : ""} onClick={() => withParam("channel", c.id)}>
                {c.color && <span className="swatch" style={{ background: c.color }} />}
                {c.label}
              </button>
            ))}
          </div>
          <div className="range">
            {RANGES.map((d) => (
              <button key={d} className={days === d ? "on" : ""} onClick={() => withParam("days", String(d))}>
                {d}D
              </button>
            ))}
          </div>
        </header>
        <div className="content page-rise" key={pathname + searchParams.toString()}>
          {children}
        </div>
      </main>
    </div>
  );
}
