import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import TradesPageClient from "./TradesPageClient";

export default async function TradesPage() {
  const token = await getConvexTokenOrThrow();

  const [preloadedTrades, preloadedTradePlans] = await Promise.all([
    preloadQuery(api.trades.listTrades, {}, { token }),
    preloadQuery(api.tradePlans.listTradePlans, {}, { token }),
  ]);

  return (
    <TradesPageClient
      preloadedTrades={preloadedTrades}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
