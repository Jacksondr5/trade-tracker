"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Badge, Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "~/lib/format";
import {
  getEndOfDay,
  getStartOfDay,
  getStartOfMonth,
  getStartOfWeek,
  getStartOfYear,
  parseDateInputLocal,
} from "~/lib/trades/dateUtils";
import {
  DEFAULT_TRADES_PAGE_SIZE,
  TRADES_PAGE_SIZE_OPTIONS,
  decodeCursorHistory,
  encodeCursorHistory,
  normalizeTradesCursor,
  normalizeTradesPageSize,
} from "~/lib/trades/pagination";
import { cn } from "~/lib/utils";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  isKrakenDefaultAccountId,
} from "../../../../shared/imports/constants";
import { EditTradeForm } from "./components/edit-trade-form";

function formatDateForInput(epochMs: number): string {
  const d = new Date(epochMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

type QuickFilter = "today" | "week" | "month" | "year" | "all";
const QUICK_FILTER_VALUES = ["today", "week", "month", "year", "all"] as const;

function isQuickFilter(value: string): value is QuickFilter {
  return QUICK_FILTER_VALUES.includes(value as QuickFilter);
}

export default function TradesPageClient({
  preloadedAccountMappings,
  preloadedPortfolios,
  preloadedTradesPage,
  preloadedTradePlans,
}: {
  preloadedAccountMappings: Preloaded<
    typeof api.accountMappings.listAccountMappings
  >;
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
  preloadedTradesPage: Preloaded<typeof api.trades.listTradesPage>;
  preloadedTradePlans: Preloaded<typeof api.tradePlans.listTradePlans>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tradesPage = usePreloadedQuery(preloadedTradesPage);
  const tradePlans = usePreloadedQuery(preloadedTradePlans);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const [editingTradeId, setEditingTradeId] = useState<Id<"trades"> | null>(null);
  const [isNavigating, startTransition] = useTransition();

  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");
  const cursorParam = normalizeTradesCursor(searchParams.get("cursor"));
  const cursorHistory = decodeCursorHistory(searchParams.get("cursorHistory"));
  const rawQuickFilterParam = searchParams.get("filter");
  const quickFilterParam =
    rawQuickFilterParam && isQuickFilter(rawQuickFilterParam)
      ? rawQuickFilterParam
      : null;
  const currentPage = cursorHistory.length + 1;

  const pageSize = normalizeTradesPageSize(
    Number(searchParams.get("pageSize") ?? String(DEFAULT_TRADES_PAGE_SIZE)),
  );

  const tradePlanNameMap = useMemo(
    () => new Map(tradePlans.map((p) => [p._id, p.name])),
    [tradePlans],
  );

  const portfolioNameMap = useMemo(
    () => new Map(portfolios.map((p) => [p._id, p.name])),
    [portfolios],
  );

  const accountNameByKey = useMemo(
    () =>
      new Map(
        accountMappings.map((mapping) => [
          `${mapping.source}|${mapping.accountId}`,
          mapping.friendlyName,
        ]),
      ),
    [accountMappings],
  );

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();

    if (quickFilterParam) {
      if (quickFilterParam === "today") {
        return { endDate: getEndOfDay(now), startDate: getStartOfDay(now) };
      }
      if (quickFilterParam === "week") {
        return { endDate: getEndOfDay(now), startDate: getStartOfWeek(now) };
      }
      if (quickFilterParam === "month") {
        return { endDate: getEndOfDay(now), startDate: getStartOfMonth(now) };
      }
      if (quickFilterParam === "year") {
        return { endDate: getEndOfDay(now), startDate: getStartOfYear(now) };
      }
      return { endDate: null, startDate: null };
    }

    const parsedStartDate = startDateParam ? parseDateInputLocal(startDateParam) : null;
    const parsedEndDate = endDateParam ? parseDateInputLocal(endDateParam) : null;
    return {
      endDate: parsedEndDate ? getEndOfDay(parsedEndDate) : null,
      startDate: parsedStartDate ? getStartOfDay(parsedStartDate) : null,
    };
  }, [endDateParam, quickFilterParam, startDateParam]);

  const updateFilter = (params: {
    cursor?: string | null;
    cursorHistory?: ReadonlyArray<string | null>;
    endDate?: string | null;
    filter?: QuickFilter | null;
    pageSize?: number | null;
    startDate?: string | null;
  }) => {
    const newParams = new URLSearchParams();

    if (params.filter === "all") {
      // "All Time" intentionally clears filter/startDate/endDate from the URL.
    } else if (params.filter) {
      newParams.set("filter", params.filter);
    } else {
      if (params.startDate) newParams.set("startDate", params.startDate);
      if (params.endDate) newParams.set("endDate", params.endDate);
    }

    if (params.pageSize && params.pageSize !== DEFAULT_TRADES_PAGE_SIZE) {
      newParams.set("pageSize", String(params.pageSize));
    }

    if (params.cursor) {
      newParams.set("cursor", params.cursor);
    }

    const encodedCursorHistory = encodeCursorHistory(params.cursorHistory ?? []);
    if (encodedCursorHistory) {
      newParams.set("cursorHistory", encodedCursorHistory);
    }

    const queryString = newParams.toString();
    startTransition(() => {
      router.push(queryString ? `/trades?${queryString}` : "/trades");
    });
  };

  const handleQuickFilter = (filter: QuickFilter) => {
    updateFilter({ cursor: null, cursorHistory: [], filter, pageSize });
  };

  const handleCustomDateChange = (type: "startDate" | "endDate", value: string) => {
    updateFilter({
      cursor: null,
      cursorHistory: [],
      endDate: type === "endDate" ? value : (endDateParam ?? ""),
      filter: null,
      pageSize,
      startDate: type === "startDate" ? value : (startDateParam ?? ""),
    });
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;

    const nextCursorHistory = cursorHistory.slice(0, -1);
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    updateFilter({
      cursor: previousCursor,
      cursorHistory: nextCursorHistory,
      endDate: endDateParam,
      filter: quickFilterParam,
      pageSize,
      startDate: startDateParam,
    });
  };

  const handleNextPage = () => {
    if (tradesPage.isDone) return;

    updateFilter({
      cursor: tradesPage.continueCursor,
      cursorHistory: [...cursorHistory, cursorParam],
      endDate: endDateParam,
      filter: quickFilterParam,
      pageSize,
      startDate: startDateParam,
    });
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    updateFilter({
      cursor: null,
      cursorHistory: [],
      endDate: endDateParam,
      filter: quickFilterParam,
      pageSize: nextPageSize,
      startDate: startDateParam,
    });
  };

  const isQuickFilterActive = (filter: QuickFilter): boolean => {
    if (filter === "all") {
      return !quickFilterParam && startDate === null && endDate === null;
    }
    return quickFilterParam === filter;
  };

  const trades = tradesPage.page;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Trades</h1>
        <Link href="/trades/new">
          <Button dataTestId="new-trade-button">New Trade</Button>
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { label: "Today", value: "today" },
                { label: "This Week", value: "week" },
                { label: "This Month", value: "month" },
                { label: "This Year", value: "year" },
                { label: "All Time", value: "all" },
              ] as const
            ).map(({ label, value }) => (
              <button
                key={value}
                onClick={() => handleQuickFilter(value)}
                className={cn("rounded px-3 py-1.5 text-sm font-medium transition-colors", {
                  "bg-blue-600 text-white": isQuickFilterActive(value),
                  "bg-slate-700 text-slate-300 hover:bg-slate-600":
                    !isQuickFilterActive(value),
                })}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-11 text-sm">or</span>
            <input
              type="date"
              value={startDateParam || ""}
              onChange={(e) => handleCustomDateChange("startDate", e.target.value)}
              className="text-slate-12 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              aria-label="Start date"
            />
            <span className="text-slate-11 text-sm">to</span>
            <input
              type="date"
              value={endDateParam || ""}
              onChange={(e) => handleCustomDateChange("endDate", e.target.value)}
              className="text-slate-12 rounded border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              aria-label="End date"
            />
          </div>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">
            {startDate !== null || endDate !== null
              ? "No trades found for the selected date range."
              : "No trades yet."}
          </p>
          {startDate === null && endDate === null && (
            <p className="text-slate-11 mt-2 text-sm">
              Click &quot;New Trade&quot; to record your first trade.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full table-auto">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Date</th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Ticker</th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Trade Plan</th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Portfolio</th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Side</th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Direction</th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">Price</th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">Quantity</th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">Total</th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">Account</th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 bg-slate-900">
                {trades.map((trade) => {
                  let accountDisplay = "—";
                  if (
                    trade.brokerageAccountId &&
                    (trade.source === "ibkr" || trade.source === "kraken")
                  ) {
                    const accountName = accountNameByKey.get(
                      `${trade.source}|${trade.brokerageAccountId}`,
                    );
                    accountDisplay = accountName
                      ? isKrakenDefaultAccountId(trade.brokerageAccountId)
                        ? accountName
                        : `${accountName} (${trade.brokerageAccountId})`
                      : isKrakenDefaultAccountId(trade.brokerageAccountId)
                        ? KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME
                        : trade.brokerageAccountId;
                  }

                  return (
                    <React.Fragment key={trade._id}>
                      <tr className="hover:bg-slate-800/50" data-testid={`trade-row-${trade._id}`}>
                        <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm">{formatDate(trade.date)}</td>
                        <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">{trade.ticker}</td>
                        <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                          {trade.tradePlanId ? (tradePlanNameMap.get(trade.tradePlanId) ?? "—") : "—"}
                        </td>
                        <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                          {trade.portfolioId ? (portfolioNameMap.get(trade.portfolioId) ?? "—") : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <Badge variant={trade.side === "buy" ? "success" : "danger"}>
                            {trade.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">{trade.direction}</td>
                        <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">{formatCurrency(trade.price)}</td>
                        <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">{trade.quantity}</td>
                        <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm font-medium">
                          {formatCurrency(trade.price * trade.quantity)}
                        </td>
                        <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">{accountDisplay}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTradeId(editingTradeId === trade._id ? null : trade._id)
                            }
                            className="text-slate-11 hover:text-slate-12 transition-colors"
                            aria-label="Edit trade"
                            data-testid={`edit-trade-${trade._id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {editingTradeId === trade._id && (
                        <tr>
                          <td colSpan={11} className="px-4 py-3">
                            <EditTradeForm
                              tradeId={trade._id}
                              initialValues={{
                                assetType: trade.assetType,
                                date: formatDateForInput(trade.date),
                                direction: trade.direction,
                                notes: trade.notes ?? "",
                                portfolioId: trade.portfolioId ?? "",
                                price: String(trade.price),
                                quantity: String(trade.quantity),
                                side: trade.side,
                                ticker: trade.ticker,
                                tradePlanId: trade.tradePlanId ?? "",
                              }}
                              portfolios={portfolios}
                              tradePlans={tradePlans}
                              onCancel={() => setEditingTradeId(null)}
                              onSaved={() => setEditingTradeId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-slate-11 text-sm">
              Showing {trades.length} trade{trades.length === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-slate-11 text-sm" htmlFor="page-size-select">
                Rows per page
              </label>
              <select
                id="page-size-select"
                className="text-slate-12 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                disabled={isNavigating}
              >
                {TRADES_PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Previous page"
                title="Previous page"
                className="rounded border border-slate-600 p-1.5 text-slate-12 disabled:opacity-50"
                onClick={handlePrevPage}
                disabled={cursorHistory.length === 0 || isNavigating}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-slate-11 text-sm">Page {currentPage}</span>
              <button
                type="button"
                aria-label="Next page"
                title="Next page"
                className="rounded border border-slate-600 p-1.5 text-slate-12 disabled:opacity-50"
                onClick={handleNextPage}
                disabled={tradesPage.isDone || isNavigating}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
