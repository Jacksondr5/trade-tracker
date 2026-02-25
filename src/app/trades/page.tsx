import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import {
  getEndOfDay,
  getStartOfDay,
  getStartOfMonth,
  getStartOfWeek,
  getStartOfYear,
  parseDateInputLocal,
} from "~/lib/trades/dateUtils";
import {
  normalizeTradesCursor,
  normalizeTradesPageSize,
} from "~/lib/trades/pagination";
import TradesPageClient from "./TradesPageClient";

function parseTradesQueryState(searchParams: {
  [key: string]: string | string[] | undefined;
}) {
  const filterValue = searchParams.filter;
  const filter = typeof filterValue === "string" ? filterValue : undefined;
  const rawCursor =
    typeof searchParams.cursor === "string" ? searchParams.cursor : null;
  const cursor = normalizeTradesCursor(rawCursor);
  const pageSize = normalizeTradesPageSize(Number(searchParams.pageSize ?? "25"));

  const now = new Date();
  let startDate: number | undefined;
  let endDate: number | undefined;

  if (filter === "today") {
    startDate = getStartOfDay(now);
    endDate = getEndOfDay(now);
  } else if (filter === "week") {
    startDate = getStartOfWeek(now);
    endDate = getEndOfDay(now);
  } else if (filter === "month") {
    startDate = getStartOfMonth(now);
    endDate = getEndOfDay(now);
  } else if (filter === "year") {
    startDate = getStartOfYear(now);
    endDate = getEndOfDay(now);
  } else {
    const rawStartDate = searchParams.startDate;
    const rawEndDate = searchParams.endDate;
    const parsedStartDate =
      typeof rawStartDate === "string" ? parseDateInputLocal(rawStartDate) : null;
    const parsedEndDate =
      typeof rawEndDate === "string" ? parseDateInputLocal(rawEndDate) : null;

    if (parsedStartDate) startDate = getStartOfDay(parsedStartDate);
    if (parsedEndDate) endDate = getEndOfDay(parsedEndDate);
  }

  return {
    endDate,
    paginationOpts: {
      cursor,
      numItems: pageSize,
    },
    startDate,
  };
}

export default async function TradesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const token = await getConvexTokenOrThrow();
  const resolvedSearchParams = await searchParams;
  const queryState = parseTradesQueryState(resolvedSearchParams);

  const [preloadedTradesPage, preloadedTradePlans, preloadedAccountMappings] =
    await Promise.all([
      preloadQuery(api.trades.listTradesPage, queryState, { token }),
      preloadQuery(api.tradePlans.listTradePlans, {}, { token }),
      preloadQuery(api.accountMappings.listAccountMappings, {}, { token }),
    ]);

  return (
    <TradesPageClient
      preloadedAccountMappings={preloadedAccountMappings}
      preloadedTradesPage={preloadedTradesPage}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
