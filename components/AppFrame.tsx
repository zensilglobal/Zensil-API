"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  LayoutGrid,
  ShoppingCart,
  Package,
  Target,
  RotateCw,
  Layers,
  Star,
  Sparkles,
  Menu,
  CalendarRange,
  Check,
  X,
} from "lucide-react";
import { ChannelFilter, RangeDays, SyncStatus } from "@/lib/types";
import { ZensilLockup } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid, group: "Command" },
  { href: "/sales", label: "Sales & Orders", icon: ShoppingCart, group: "Command" },
  { href: "/inventory", label: "Inventory", icon: Package, group: "Command", badgeKey: "inventory" },
  { href: "/advertising", label: "Advertising", icon: Target, group: "Command", badgeKey: "advertising" },
  { href: "/returns", label: "Returns", icon: RotateCw, group: "Command" },
  { href: "/reviews", label: "Reviews", icon: Star, group: "Command", badgeKey: "reviews" },
  { href: "/products", label: "Products", icon: Layers, group: "Command" },
  { href: "/insights", label: "Claude Insights", icon: Sparkles, group: "Intelligence", badgeKey: "insights" },
] as const;

const TITLES: Record<string, { t: string; s: string }> = {
  "/": { t: "Overview", s: "Headline performance across all channels" },
  "/sales": { t: "Sales & Orders", s: "Revenue, orders and fulfilment status" },
  "/inventory": { t: "Inventory", s: "Stock health & stockout forecasting" },
  "/advertising": { t: "Advertising", s: "Amazon campaign performance & wasted spend" },
  "/returns": { t: "Returns", s: "Return-rate outliers & reasons" },
  "/reviews": { t: "Reviews", s: "Customer ratings & sentiment across channels" },
  "/products": { t: "Products", s: "Cross-channel SKU master" },
  "/insights": { t: "Claude Insights", s: "Ask plain-English questions over live data" },
  "/drilldown/revenue": { t: "Net Revenue — Detail", s: "Every rupee by product, channel, price & units" },
  "/drilldown/orders": { t: "Orders — Detail", s: "Every order line in the window, SKU-wise" },
  "/drilldown/aov": { t: "Avg Order Value — Detail", s: "The per-order values behind the average" },
  "/drilldown/acos": { t: "Blended ACOS — Detail", s: "Campaign spend, attributed sales & wasted terms" },
  "/drilldown/stock": { t: "Inventory — Detail", s: "FBA vs Easy Ship units, cover & status per SKU" },
  "/drilldown/returns": { t: "Returns — Detail", s: "SKU-wise rates and every individual return event" },
};

const CHANNELS: { id: ChannelFilter; label: string; color?: string }[] = [
  { id: "all", label: "All" },
  { id: "amazon", label: "Amazon", color: "var(--color-amazon)" },
  { id: "flipkart", label: "Flipkart", color: "var(--color-flipkart)" },
  { id: "shopify", label: "Shopify", color: "var(--color-shopify)" },
];
const RANGES: RangeDays[] = [7, 15, 30, 90];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function niceDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

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
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const customActive = !!(from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to);
  const days = customActive ? 0 : Number(searchParams.get("days")) || 30;

  const title = pathname.startsWith("/products/")
    ? { t: "Product Detail", s: "Everything about one SKU — sales, stock, ads context & returns" }
    : (TITLES[pathname] ?? { t: "Zensil Ops", s: "" });

  function apply(mutate: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setChannel(value: ChannelFilter) {
    apply((p) => (value === "all" ? p.delete("channel") : p.set("channel", value)));
  }

  function setDays(value: RangeDays) {
    apply((p) => {
      p.delete("from");
      p.delete("to");
      if (value === 30) p.delete("days");
      else p.set("days", String(value));
    });
  }

  function setCustom(f: string, t: string) {
    apply((p) => {
      p.delete("days");
      p.set("from", f);
      p.set("to", t);
    });
  }

  function clearCustom() {
    apply((p) => {
      p.delete("from");
      p.delete("to");
    });
  }

  function navHref(href: string) {
    const qs = searchParams.toString();
    return qs ? `${href}?${qs}` : href;
  }

  /* ---------- custom range popover ---------- */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDoc(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  function openPicker() {
    setDraftFrom(from || new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
    setDraftTo(to || new Date().toISOString().slice(0, 10));
    setPickerOpen((o) => !o);
  }

  const draftValid = DATE_RE.test(draftFrom) && DATE_RE.test(draftTo) && draftFrom <= draftTo;

  return (
    <div className="app">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <Link href={navHref("/")} aria-label="Zensil — Overview">
            <ZensilLockup size={56} />
          </Link>
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
              <button type="submit" className="tiny muted signout">
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
              <button key={c.id} className={channel === c.id ? "on" : ""} onClick={() => setChannel(c.id)}>
                {c.color && <span className="swatch" style={{ background: c.color }} />}
                {c.label}
              </button>
            ))}
          </div>
          <div className="range-wrap" ref={pickerRef}>
            <div className="range">
              {RANGES.map((d) => (
                <button key={d} className={!customActive && days === d ? "on" : ""} onClick={() => setDays(d)}>
                  {d}D
                </button>
              ))}
              <button className={`custom ${customActive ? "on" : ""}`} onClick={openPicker} aria-expanded={pickerOpen}>
                <CalendarRange size={13} />
                {customActive ? `${niceDate(from)} – ${niceDate(to)}` : "Custom"}
              </button>
            </div>
            {pickerOpen && (
              <div className="range-pop">
                <div className="range-pop-title">Custom date range</div>
                <div className="range-pop-fields">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={draftFrom}
                      max={draftTo || undefined}
                      onChange={(e) => setDraftFrom(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>To</span>
                    <input
                      type="date"
                      value={draftTo}
                      min={draftFrom || undefined}
                      onChange={(e) => setDraftTo(e.target.value)}
                    />
                  </label>
                </div>
                <div className="range-pop-actions">
                  {customActive && (
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() => {
                        clearCustom();
                        setPickerOpen(false);
                      }}
                    >
                      <X size={13} /> Clear
                    </button>
                  )}
                  <div className="spacer" />
                  <button
                    type="button"
                    className="btn brand tiny"
                    disabled={!draftValid}
                    onClick={() => {
                      setCustom(draftFrom, draftTo);
                      setPickerOpen(false);
                    }}
                  >
                    <Check size={13} /> Apply
                  </button>
                </div>
              </div>
            )}
          </div>
          <ThemeToggle />
        </header>
        <div className="content page-rise" key={pathname + searchParams.toString()}>
          {children}
        </div>
      </main>
    </div>
  );
}
