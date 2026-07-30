"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

/*
  The "can't reach the warehouse" panel. Lives here rather than in
  (dash)/error.tsx because two callers need it: that error boundary, and the
  overview page, which catches its own warehouse failure so the live strip
  above it survives (a marketplace read does not care that Neon is down).

  React strips server-component error messages in production builds, so an
  `error.message` from the boundary is only the generic "specific message is
  omitted" boilerplate — useless for telling a quota problem from a bad
  password. /api/health runs server-side and reports the real reason, so ask
  it rather than guessing from the redacted text.
*/
type Health = { ok: boolean; db: "ok" | "sample" | "error"; detail?: string };
type Probe = { state: "checking" } | { state: "done"; health: Health } | { state: "unknown" };

export default function WarehouseError({
  digest,
  retry,
}: {
  /** Correlates this render with the full stack trace in the Render logs. */
  digest?: string;
  /** The boundary's own retry; without it, re-run the server render. */
  retry?: () => void;
}) {
  const [probe, setProbe] = useState<Probe>({ state: "checking" });
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((health: Health) => !cancelled && setProbe({ state: "done", health }))
      .catch(() => !cancelled && setProbe({ state: "unknown" }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card">
      <div className="card-b">
        <div className="flex" style={{ gap: 13, alignItems: "flex-start" }}>
          <div
            className="ic"
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              background: "rgba(212,175,55,.1)",
              border: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} color="var(--color-gold)" />
          </div>
          <div>
            <div className="strong">Can&rsquo;t reach the warehouse</div>
            <div className="tiny muted" style={{ marginTop: 3, maxWidth: 580 }}>
              <Reason probe={probe} />
            </div>
            {digest ? (
              <div className="tiny muted" style={{ marginTop: 8, fontFamily: "var(--font-jetbrains)" }}>
                digest {digest}
              </div>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 13 }}
              disabled={pending}
              onClick={() => (retry ? retry() : start(() => router.refresh()))}
            >
              <RotateCw size={15} className={pending ? "spin" : undefined} />{" "}
              {pending ? "Retrying…" : "Try again"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Reason({ probe }: { probe: Probe }) {
  if (probe.state === "checking") return <>Checking the warehouse connection&hellip;</>;

  if (probe.state === "unknown")
    return (
      <>
        This page needs live warehouse data and the query failed. The connection check
        also could not be reached, so the app itself may be restarting — retry in a moment.
      </>
    );

  const { db, detail } = probe.health;

  if (db === "error" && /compute time quota/i.test(detail || ""))
    return (
      <>
        The Neon database has exceeded its compute-time quota and is refusing connections.
        Upgrade the Neon plan or wait for the quota to reset — this page recovers on its
        own once the database accepts connections again, with no redeploy needed.
      </>
    );

  if (db === "error")
    return (
      <>
        The warehouse rejected the connection: <b>{detail || "unknown error"}</b>
      </>
    );

  // health says the warehouse is fine, so this page failed for some other reason
  return (
    <>
      The warehouse is reachable
      {db === "sample" ? " (running on sample data)" : ""}, so this page failed for another
      reason. Quote the digest below when checking the server logs.
    </>
  );
}
