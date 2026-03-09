import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import { buildTradesPageQueryArgs } from "~/lib/trades/filters";
import TradesPageClient from "./TradesPageClient";

export default async function TradesPage() {
  const token = await getConvexTokenOrThrow();

  const [
    preloadedTradesPage,
    preloadedTradePlans,
    preloadedAccountMappings,
    preloadedKnownAccounts,
    preloadedPortfolios,
  ] = await Promise.all([
    preloadQuery(api.trades.listTradesPage, buildTradesPageQueryArgs({}), {
      token,
    }),
    preloadQuery(api.tradePlans.listTradePlans, {}, { token }),
    preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    preloadQuery(api.accountMappings.listKnownBrokerageAccounts, {}, { token }),
    preloadQuery(api.portfolios.listPortfolios, {}, { token }),
  ]);

  return (
    <TradesPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedKnownAccounts={preloadedKnownAccounts}
      preloadedPortfolios={preloadedPortfolios}
      preloadedTradesPage={preloadedTradesPage}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
