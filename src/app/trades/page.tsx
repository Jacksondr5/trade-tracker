import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import TradesPageClient from "./TradesPageClient";

export default async function TradesPage() {
  const token = await getConvexTokenOrThrow();

  const [
    preloadedTrades,
    preloadedTradePlans,
    preloadedAccountMappings,
    preloadedPortfolios,
  ] = await Promise.all([
    preloadQuery(api.trades.listTrades, {}, { token }),
    preloadQuery(api.tradePlans.listTradePlans, {}, { token }),
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    preloadQuery(api.portfolios.listPortfolios, {}, { token }),
  ]);

  return (
    <TradesPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedPortfolios={preloadedPortfolios}
      preloadedTrades={preloadedTrades}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
