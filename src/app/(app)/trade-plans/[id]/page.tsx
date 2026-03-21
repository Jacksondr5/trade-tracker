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
  const preloadedTradePlanWorkspace = await preloadQuery(
    api.tradePlans.getTradePlanWorkspace,
    { tradePlanId },
    { token },
  );

  return (
    <TradePlanDetailPageClient
      tradePlanId={tradePlanId}
      preloadedTradePlanWorkspace={preloadedTradePlanWorkspace}
    />
  );
}
