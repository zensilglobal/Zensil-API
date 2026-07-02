import { Suspense } from "react";
import AppFrame from "@/components/AppFrame";
import { getStockHealth, getCampaigns, decisionCount } from "@/lib/queries";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [stock, campaigns, decisions] = await Promise.all([
    getStockHealth({ channel: "all", days: 30 }),
    getCampaigns(),
    decisionCount(),
  ]);
  const badges = {
    inventory: stock.filter((r) => r.status === "critical").length,
    advertising: campaigns.filter((c) => c.acos > 50).length,
    insights: decisions,
  };
  return (
    <Suspense>
      <AppFrame badges={badges}>{children}</AppFrame>
    </Suspense>
  );
}
