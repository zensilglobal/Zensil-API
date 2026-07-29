"use client";
import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/*
  Dashboard pages read the warehouse at request time, so an outage there
  surfaces as a render error. Show what actually broke instead of a blank
  crash screen — and never substitute sample numbers, which would quietly
  misreport the business.

  Note this does not cover (dash)/layout.tsx: error.tsx never wraps the
  layout in its own segment, so those queries degrade there instead.
*/
export default function DashError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("dashboard render failed:", error);
  }, [error]);

  // the warehouse is the only dependency these pages have
  const quota = /compute time quota/i.test(error.message);

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
            <div className="tiny muted" style={{ marginTop: 3, maxWidth: 560 }}>
              {quota ? (
                <>
                  The Neon database has exceeded its compute-time quota, so it is refusing
                  connections. Upgrade the Neon plan or wait for the quota to reset — the
                  dashboard recovers on its own once the database accepts connections again.
                </>
              ) : (
                <>
                  This page needs live warehouse data and the query failed. The rest of the
                  dashboard still works; retry once the connection is back.
                </>
              )}
            </div>
            <div className="tiny muted" style={{ marginTop: 8, fontFamily: "var(--font-jetbrains)" }}>
              {error.message}
              {error.digest ? ` · ${error.digest}` : ""}
            </div>
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
