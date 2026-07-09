import { Suspense } from "react";
import AppFrame from "@/components/AppFrame";
import { getStockHealth, getCampaigns, decisionCount, getSyncStatus, reviewAlertCount } from "@/lib/queries";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [stock, campaigns, decisions, sync, lowReviews] = await Promise.all([
    getStockHealth({ channel: "all", days: 30 }),
    getCampaigns(),
    decisionCount(),
    getSyncStatus(),
    reviewAlertCount(),
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
