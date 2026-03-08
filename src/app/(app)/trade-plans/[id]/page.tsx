import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import TradePlanDetailPageClient from "./TradePlanDetailPageClient";

export default async function TradePlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tradePlanId = id as Id<"tradePlans">;

  const token = await getConvexTokenOrThrow();
  const [
    preloadedTradePlan,
    preloadedNotes,
    preloadedTrades,
    preloadedAccountMappings,
    preloadedInboxTradesForPlan,
    preloadedPortfolios,
  ] = await Promise.all([
    preloadQuery(api.tradePlans.getTradePlan, { tradePlanId }, { token }),
    preloadQuery(api.notes.getNotesByTradePlan, { tradePlanId }, { token }),
    preloadQuery(api.trades.listTradesByTradePlan, { tradePlanId }, { token }),
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    preloadQuery(api.imports.listInboxTradesForTradePlan, { tradePlanId }, { token }),
    preloadQuery(api.portfolios.listPortfolios, {}, { token }),
  ]);

  return (
    <TradePlanDetailPageClient
      tradePlanId={tradePlanId}
      preloadedTradePlan={preloadedTradePlan}
      preloadedNotes={preloadedNotes}
      preloadedTrades={preloadedTrades}
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedInboxTradesForPlan={preloadedInboxTradesForPlan}
      preloadedPortfolios={preloadedPortfolios}
    />
  );
}
