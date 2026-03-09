import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import {
  normalizeTradesAccountParam,
  normalizeTradesDateParam,
  normalizeTradesPortfolioParam,
  normalizeTradesTickerParam,
  parseTradesQueryState,
} from "~/lib/trades/filters";
import {
  DEFAULT_TRADES_PAGE_SIZE,
  normalizeTradesCursor,
  normalizeTradesPageSize,
} from "~/lib/trades/pagination";
import TradesPageClient from "./TradesPageClient";

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const token = await getConvexTokenOrThrow();
  const resolvedSearchParams = await searchParams;


  const initialFilterState = {
    account: normalizeTradesAccountParam(
      typeof resolvedSearchParams.account === "string"
        ? resolvedSearchParams.account
        : null,
    ) ?? "",
    cursor: normalizeTradesCursor(
      typeof resolvedSearchParams.cursor === "string"
        ? resolvedSearchParams.cursor
        : null,
    ),
    endDate:
      normalizeTradesDateParam(
        typeof resolvedSearchParams.endDate === "string"
          ? resolvedSearchParams.endDate
          : null,
      ) ?? "",
    pageSize: normalizeTradesPageSize(
      Number(
        typeof resolvedSearchParams.pageSize === "string"
          ? resolvedSearchParams.pageSize
          : String(DEFAULT_TRADES_PAGE_SIZE),
      ),
    ),
    portfolio: normalizeTradesPortfolioParam(
      typeof resolvedSearchParams.portfolio === "string"
        ? resolvedSearchParams.portfolio
        : null,
    ) ?? "",
    startDate:
      normalizeTradesDateParam(
        typeof resolvedSearchParams.startDate === "string"
          ? resolvedSearchParams.startDate
          : null,
      ) ?? "",
    ticker: normalizeTradesTickerParam(
      typeof resolvedSearchParams.ticker === "string"
        ? resolvedSearchParams.ticker
        : null,
    ),
  };

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
      initialFilterState={initialFilterState}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
