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
  const [preloadedTradePlan, preloadedNotes, preloadedTrades, preloadedAccountMappings] =
    await Promise.all([
      preloadQuery(api.tradePlans.getTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.tradePlanNotes.getNotesByTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.trades.listTradesByTradePlan, { tradePlanId }, { token }),
      preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    ]);

  return (
    <TradePlanDetailPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedNotes={preloadedNotes}
      preloadedTradePlan={preloadedTradePlan}
      preloadedTrades={preloadedTrades}
      tradePlanId={tradePlanId}
    />
  );
}
