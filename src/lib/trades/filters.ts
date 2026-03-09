import type { Id } from "~/convex/_generated/dataModel";
import { getEndOfDay, getStartOfDay, parseDateInputLocal } from "./dateUtils";
import {
  DEFAULT_TRADES_PAGE_SIZE,
  normalizeTradesCursor,
  normalizeTradesPageSize,
} from "./pagination";

export const NO_PORTFOLIO_FILTER_VALUE = "none";

export type BrokerageSource = "ibkr" | "kraken";

export type ParsedTradeAccountFilter = {
  accountId: string;
  source: BrokerageSource;
};

function getSingleSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeTradesDateParam(
  value: string | null | undefined,
): string | null {
  return normalizeOptionalString(value);
}

export function normalizeTradesTickerParam(
  value: string | null | undefined,
): string | null {
  return normalizeOptionalString(value);
}

export function normalizeTradesPortfolioParam(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  return normalized === NO_PORTFOLIO_FILTER_VALUE ? NO_PORTFOLIO_FILTER_VALUE : normalized;
}

export function buildTradeAccountKey(filter: ParsedTradeAccountFilter): string {
  return `${filter.source}|${filter.accountId}`;
}

export function parseTradeAccountKey(
  value: string | null | undefined,
): ParsedTradeAccountFilter | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const separatorIndex = normalized.indexOf("|");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null;
  }

  const source = normalized.slice(0, separatorIndex);
  const accountId = normalized.slice(separatorIndex + 1).trim();

  if ((source !== "ibkr" && source !== "kraken") || !accountId) {
    return null;
  }

  return {
    accountId,
    source,
  };
}

export function normalizeTradesAccountParam(
  value: string | null | undefined,
): string | null {
  const parsed = parseTradeAccountKey(value);
  return parsed ? buildTradeAccountKey(parsed) : null;
}

export function buildTradesPageQueryArgs(args: {
  account?: string | null;
  cursor?: string | null;
  endDate?: string | null;
  pageSize?: number;
  portfolio?: string | null;
  startDate?: string | null;
  ticker?: string | null;
}) {
  const startDateInput = normalizeTradesDateParam(args.startDate);
  const endDateInput = normalizeTradesDateParam(args.endDate);
  const ticker = normalizeTradesTickerParam(args.ticker);
  const portfolio = normalizeTradesPortfolioParam(args.portfolio);
  const account = parseTradeAccountKey(args.account);

  const parsedStartDate = startDateInput
    ? parseDateInputLocal(startDateInput)
    : null;
  const parsedEndDate = endDateInput ? parseDateInputLocal(endDateInput) : null;

  return {
    accountId: account?.accountId,
    accountSource: account?.source,
    endDate: parsedEndDate ? getEndOfDay(parsedEndDate) : undefined,
    paginationOpts: {
      cursor: normalizeTradesCursor(args.cursor ?? null),
      numItems: normalizeTradesPageSize(
        args.pageSize ?? DEFAULT_TRADES_PAGE_SIZE,
      ),
    },
    portfolioId:
      portfolio && portfolio !== NO_PORTFOLIO_FILTER_VALUE
        ? (portfolio as Id<"portfolios">)
        : undefined,
    startDate: parsedStartDate ? getStartOfDay(parsedStartDate) : undefined,
    ticker: ticker ?? undefined,
    withoutPortfolio:
      portfolio === NO_PORTFOLIO_FILTER_VALUE ? true : undefined,
  };
}

export function parseTradesQueryState(searchParams: {
  [key: string]: string | string[] | undefined;
}) {
  return buildTradesPageQueryArgs({
    account: getSingleSearchParam(searchParams.account),
    cursor: getSingleSearchParam(searchParams.cursor) ?? null,
    endDate: getSingleSearchParam(searchParams.endDate),
    pageSize: Number(
      getSingleSearchParam(searchParams.pageSize) ??
        String(DEFAULT_TRADES_PAGE_SIZE),
    ),
    portfolio: getSingleSearchParam(searchParams.portfolio),
    startDate: getSingleSearchParam(searchParams.startDate),
    ticker: getSingleSearchParam(searchParams.ticker),
  });
}
