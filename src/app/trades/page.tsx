import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import {
  normalizeTradesPage,
  normalizeTradesPageSize,
} from "~/lib/trades/pagination";
import TradesPageClient from "./TradesPageClient";

function getStartOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getEndOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateInputLocal(dateString: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const [yearString, monthString, dayString] = dateString.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const parsedDate = new Date(year, month - 1, day);
  if (Number.isNaN(parsedDate.getTime())) return null;
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return parsedDate;
}

function parseTradesQueryState(searchParams: {
  [key: string]: string | string[] | undefined;
}) {
  const filterValue = searchParams.filter;
  const filter = typeof filterValue === "string" ? filterValue : undefined;
  const page = normalizeTradesPage(Number(searchParams.page ?? "1"));
  const pageSize = normalizeTradesPageSize(Number(searchParams.pageSize ?? "25"));

  const now = new Date();
  let startDate: number | undefined;
  let endDate: number | undefined;

  if (filter === "today") {
    startDate = getStartOfDay(now);
    endDate = getEndOfDay(now);
  } else if (filter === "week") {
    startDate = getStartOfWeek(now).getTime();
    endDate = getEndOfDay(now);
  } else if (filter === "month") {
    startDate = getStartOfMonth(now).getTime();
    endDate = getEndOfDay(now);
  } else if (filter === "year") {
    startDate = getStartOfYear(now).getTime();
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

  return { endDate, page, pageSize, startDate };
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
