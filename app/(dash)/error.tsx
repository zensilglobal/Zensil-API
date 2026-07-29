"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/*
  Dashboard pages read the warehouse at request time, so an outage there
  surfaces as a render error. Show what actually broke instead of a blank
  crash screen — and never substitute sample numbers, which would quietly
  misreport the business.

  React strips server-component error messages in production builds, so
  `error.message` here is only the generic "specific message is omitted"
  boilerplate — useless for telling a quota problem from a bad password.
  /api/health runs server-side and reports the real reason, so ask it
  rather than guessing from the redacted text. Only the digest is worth
  showing from `error` itself: it correlates this render with the full
  stack trace in the Render logs.

  Note this does not cover (dash)/layout.tsx: error.tsx never wraps the
  layout in its own segment, so those queries degrade there instead.
*/
type Health = { ok: boolean; db: "ok" | "sample" | "error"; detail?: string };
type Probe = { state: "checking" } | { state: "done"; health: Health } | { state: "unknown" };

export default function DashError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [probe, setProbe] = useState<Probe>({ state: "checking" });

  useEffect(() => {
    console.error("dashboard render failed:", error);
  }, [error]);

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
            {error.digest ? (
              <div className="tiny muted" style={{ marginTop: 8, fontFamily: "var(--font-jetbrains)" }}>
                digest {error.digest}
              </div>
            ) : null}
            <button
              type="button"
              className="btn ghost"
              style={{ marginTop: 13 }}
              onClick={() => unstable_retry()}
            >
              <RotateCw size={15} /> Try again
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
