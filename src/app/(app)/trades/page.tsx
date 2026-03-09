import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import { parseTradesQueryState } from "~/lib/trades/filters";
import TradesPageClient from "./TradesPageClient";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const token = await getConvexTokenOrThrow();
  const resolvedSearchParams = await searchParams;

  const [
    preloadedTradesPage,
    preloadedTradePlans,
    preloadedAccountMappings,
    preloadedKnownAccounts,
    preloadedPortfolios,
  ] = await Promise.all([
    preloadQuery(
      api.trades.listTradesPage,
      parseTradesQueryState(resolvedSearchParams),
      {
        token,
      },
    ),
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
