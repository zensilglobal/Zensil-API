import { Suspense } from "react";
import AppFrame from "@/components/AppFrame";
import { getStockHealth, getCampaigns, decisionCount, getSyncStatus, reviewAlertCount } from "@/lib/queries";

/*
  Every dashboard route reads the warehouse, so none of them may be
  prerendered. Set here rather than per page: segment config inherits, so
  this covers the sidebar badges below plus every page under (dash).

  Without it `next build` renders these routes at build time, which breaks
  two ways: the Docker build has no DATABASE_URL, so pages ship with the
  sample-data fallback baked into static HTML and never show real numbers;
  and any build that *does* see DATABASE_URL fails outright when the
  warehouse is unreachable.
*/
export const dynamic = "force-dynamic";

/*
  The badges are decorative, and error.tsx does not wrap the layout in its
  own segment — a throw here escapes to the root instead, blanking the
  whole app. So each count degrades to "no badge" on its own: when the
  warehouse is unreachable the nav still renders and the page below can
  show a proper error.
*/
async function count<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [stock, campaigns, decisions, sync, lowReviews] = await Promise.all([
    count(() => getStockHealth({ channel: "all", days: 30 }), []),
    count(() => getCampaigns(), []),
    count(() => decisionCount(), 0),
    // null renders the "Sample data" pill rather than claiming a fresh sync
    count(() => getSyncStatus(), null),
    count(() => reviewAlertCount(), 0),
  ]);
  const badges = {
    inventory: stock.filter((r) => r.status === "critical").length,
    advertising: campaigns.filter((c) => c.acos > 50).length,
    insights: decisions,
    reviews: lowReviews,
  };
  return (
    <Suspense>
      <AppFrame badges={badges} sync={sync}>{children}</AppFrame>
    </Suspense>
  );
}
