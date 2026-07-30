"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/*
  Keeps the live strip moving. router.refresh() re-runs the server render —
  the (dash) segment is force-dynamic, so the marketplace calls in lib/live.ts
  run again and the strip streams back in place, with no full navigation and
  no loss of scroll or filter state.

  60 s is below both source TTLs in lib/live.ts, so a tick is cheap: it
  usually replays the memoised result rather than calling a marketplace.
*/
const EVERY = 60_000;

export default function LiveIndicator({ stamp }: { stamp: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    const tick = () => {
      // A background tab still fires intervals. Polling one that nobody is
      // looking at spends SP-API budget the ETL scheduler also needs.
      if (document.visibilityState !== "visible") return;
      start(() => router.refresh());
    };
    const id = setInterval(tick, EVERY);
    return () => clearInterval(id);
  }, [router]);

  return (
    <button
      className="live-badge"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-label="Refresh live data now"
      title="Refresh now"
    >
      <span className="live-dot" aria-hidden />
      <span className="strong">Live</span>
      <span className="live-time">{pending ? "refreshing…" : `${stamp} IST`}</span>
      <RefreshCw size={12} className={pending ? "spin" : undefined} aria-hidden />
    </button>
  );
}
