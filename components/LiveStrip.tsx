import { getLiveTiles, liveStamp } from "@/lib/live";
import LiveIndicator from "./LiveIndicator";

/*
  Sits above the warehouse KPIs and is deliberately visually distinct from
  them: these three numbers come straight from the marketplace APIs and cover
  only today, while everything below is the warehouse's aggregated history.
  Presenting them as ordinary KPI cards would invite reading a 24 h figure as
  a period total.

  Rendered inside its own <Suspense> boundary, so a slow or hanging
  marketplace delays this strip alone — the rest of the page streams first.
*/
export default async function LiveStrip() {
  const tiles = await getLiveTiles();
  if (!tiles.length) return null;

  return (
    <section className="live-strip">
      <div className="live-head">
        <h2>Live from the marketplaces</h2>
        <span className="live-note">Direct API · not the warehouse</span>
        <div className="spacer" />
        <LiveIndicator stamp={liveStamp()} />
      </div>
      <div className="grid g-3 live-tiles">
        {tiles.map((t) => (
          <div key={t.key} className={`live-tile ${t.source}${t.error ? " err" : ""}`}>
            <div className="lab">
              <span className="swatch" aria-hidden />
              {t.label}
            </div>
            <div className="val num">{t.value}</div>
            <div className="sub">{t.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Suspense fallback — same geometry as the real strip so nothing shifts. */
export function LiveStripSkeleton() {
  return (
    <section className="live-strip" aria-hidden>
      <div className="live-head">
        <h2>Live from the marketplaces</h2>
        <span className="live-note">Direct API · not the warehouse</span>
      </div>
      <div className="grid g-3 live-tiles">
        {[0, 1, 2].map((i) => (
          <div key={i} className="live-tile skeleton">
            <i style={{ width: "45%" }} />
            <i style={{ width: "70%", height: 20, marginTop: 12 }} />
            <i style={{ width: "60%", marginTop: 12 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
