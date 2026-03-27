"use client";

import { Preloaded, useMutation, usePreloadedQuery, useQuery } from "convex/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Alert, Badge, EmptyState, Input, Select } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "~/lib/format";
import { cn } from "~/lib/utils";
import {
  TRADES_PAGE_SIZE_OPTIONS,
  normalizeTradesPageSize,
} from "~/lib/trades/pagination";
import {
  NO_PORTFOLIO_FILTER_VALUE,
  buildTradeAccountKey,
  buildTradesPageQueryArgs,
  normalizeTradesTickerParam,
} from "~/lib/trades/filters";
import type { BrokerageSource } from "~/lib/trades/filters";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  KRAKEN_DEFAULT_ACCOUNT_ID,
  isKrakenDefaultAccountId,
} from "../../../../shared/imports/constants";
import {
  APP_PAGE_TITLES,
  TRADES_INDEX_TEST_IDS,
  getTradeRowTestId,
} from "../../../../shared/e2e/testIds";
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

const SOURCE_LABELS: Record<BrokerageSource, string> = {
  ibkr: "IBKR",
  kraken: "Kraken",
};

function getAccountBaseLabel(args: {
  accountId: string;
  mappedName?: string;
  source: BrokerageSource;
}): string {
  if (args.mappedName) {
    return isKrakenDefaultAccountId(args.accountId)
      ? args.mappedName
      : `${args.mappedName} (${args.accountId})`;
  }

  if (args.source === "kraken" && isKrakenDefaultAccountId(args.accountId)) {
    return KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME;
  }

  return args.accountId;
}

export default function TradesPageClient({
  initialFilterState,
  preloadedAccountMappings,
  preloadedKnownAccounts,
  preloadedPortfolios,
  preloadedTradesPage,
  preloadedTradePlans,
}: {
  initialFilterState: {
    account: string;
    cursor: string | null;
    endDate: string;
    pageSize: number;
    portfolio: string;
    startDate: string;
    ticker: string | null;
  };
  preloadedAccountMappings: Preloaded<
    typeof api.accountMappings.listAccountMappings
  >;
  preloadedKnownAccounts: Preloaded<
    typeof api.accountMappings.listKnownBrokerageAccounts
  >;
  preloadedPortfolios: Preloaded<typeof api.portfolios.listPortfolios>;
  preloadedTradesPage: Preloaded<typeof api.trades.listTradesPage>;
  preloadedTradePlans: Preloaded<typeof api.tradePlans.listTradePlans>;
}) {
  const initialTradesPage = usePreloadedQuery(preloadedTradesPage);
  const tradePlans = usePreloadedQuery(preloadedTradePlans);
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const knownAccounts = usePreloadedQuery(preloadedKnownAccounts);
  const portfolios = usePreloadedQuery(preloadedPortfolios);
  const [editingTradeId, setEditingTradeId] = useState<Id<"trades"> | null>(
    null,
  );
  const [lastResolvedTradesPage, setLastResolvedTradesPage] =
    useState(initialTradesPage);
  const [startDateValue, setStartDateValue] = useState(
    initialFilterState.startDate,
  );
  const [endDateValue, setEndDateValue] = useState(initialFilterState.endDate);
  const [tickerInput, setTickerInput] = useState(
    initialFilterState.ticker ?? "",
  );
  const [appliedTicker, setAppliedTicker] = useState<string | null>(
    initialFilterState.ticker,
  );
  const [portfolioValue, setPortfolioValue] = useState(
    initialFilterState.portfolio,
  );
  const [accountValue, setAccountValue] = useState(initialFilterState.account);
  const [cursor, setCursor] = useState<string | null>(
    initialFilterState.cursor,
  );
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const [pageSize, setPageSize] = useState(initialFilterState.pageSize);
  const [selectedTradeIds, setSelectedTradeIds] = useState<
    Set<Id<"trades">>
  >(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const bulkUpdateTrades = useMutation(api.trades.bulkUpdateTrades);
  const currentPage = cursorHistory.length + 1;

  const toggleTradeSelection = useCallback((tradeId: Id<"trades">) => {
    setSelectedTradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(tradeId)) {
        next.delete(tradeId);
      } else {
        next.add(tradeId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTradeIds(new Set());
    setBulkError(null);
  }, []);

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

  const accountOptions = useMemo(() => {
    return knownAccounts
      .map((account) => {
        const mappedName = accountNameByKey.get(
          buildTradeAccountKey({
            accountId: account.accountId,
            source: account.source,
          }),
        );

        return {
          label: `${getAccountBaseLabel({
            accountId: account.accountId,
            mappedName,
            source: account.source,
          })} · ${SOURCE_LABELS[account.source]}`,
          value: buildTradeAccountKey({
            accountId: account.accountId,
            source: account.source,
          }),
        };
      })
      .sort(
        (a, b) =>
          a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
      );
  }, [accountNameByKey, knownAccounts]);

  useEffect(() => {
    const normalizedTickerInput = normalizeTradesTickerParam(tickerInput);
    if (normalizedTickerInput === appliedTicker) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEditingTradeId(null);
      clearSelection();
      setAppliedTicker(normalizedTickerInput);
      setCursor(null);
      setCursorHistory([]);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [appliedTicker, clearSelection, tickerInput]);

  const queryArgs = useMemo(
    () =>
      buildTradesPageQueryArgs({
        account: accountValue,
        cursor,
        endDate: endDateValue,
        pageSize,
        portfolio: portfolioValue,
        startDate: startDateValue,
        ticker: appliedTicker,
      }),
    [
      accountValue,
      appliedTicker,
      cursor,
      endDateValue,
      pageSize,
      portfolioValue,
      startDateValue,
    ],
  );

  const isUsingInitialTradesPage =
    startDateValue === initialFilterState.startDate &&
    endDateValue === initialFilterState.endDate &&
    appliedTicker === initialFilterState.ticker &&
    portfolioValue === initialFilterState.portfolio &&
    accountValue === initialFilterState.account &&
    cursor === initialFilterState.cursor &&
    pageSize === initialFilterState.pageSize;

  const queriedTradesPage = useQuery(
    api.trades.listTradesPage,
    isUsingInitialTradesPage ? "skip" : queryArgs,
  );
  const tradesPage = isUsingInitialTradesPage
    ? initialTradesPage
    : queriedTradesPage;

  useEffect(() => {
    if (tradesPage) {
      setLastResolvedTradesPage(tradesPage);
    }
  }, [tradesPage]);

  const displayedTradesPage = tradesPage ?? lastResolvedTradesPage;
  const isLoadingTradesPage = !tradesPage;

  const handleDateChange = (type: "startDate" | "endDate", value: string) => {
    setEditingTradeId(null);
    clearSelection();
    if (type === "startDate") {
      setStartDateValue(value);
    } else {
      setEndDateValue(value);
    }
    setCursor(null);
    setCursorHistory([]);
  };

  const handlePortfolioChange = (value: string) => {
    setEditingTradeId(null);
    clearSelection();
    setPortfolioValue(value);
    setCursor(null);
    setCursorHistory([]);
  };

  const handleAccountChange = (value: string) => {
    setEditingTradeId(null);
    clearSelection();
    setAccountValue(value);
    setCursor(null);
    setCursorHistory([]);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;

    setEditingTradeId(null);
    clearSelection();
    const nextCursorHistory = cursorHistory.slice(0, -1);
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursor(previousCursor);
    setCursorHistory(nextCursorHistory);
  };

  const handleNextPage = () => {
    if (!tradesPage || tradesPage.isDone) return;

    setEditingTradeId(null);
    clearSelection();
    setCursorHistory([...cursorHistory, cursor]);
    setCursor(tradesPage.continueCursor);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setEditingTradeId(null);
    clearSelection();
    setPageSize(normalizeTradesPageSize(nextPageSize));
    setCursor(null);
    setCursorHistory([]);
  };

  const handleBulkUpdate = async (field: "tradePlanId" | "portfolioId", value: string) => {
    if (selectedTradeIds.size === 0) return;
    setBulkUpdating(true);
    setBulkError(null);
    try {
      const resolvedValue = value === "__remove__"
        ? null
        : value as Id<"tradePlans"> | Id<"portfolios">;
      const result = await bulkUpdateTrades({
        tradeIds: Array.from(selectedTradeIds),
        ...(field === "tradePlanId"
          ? { tradePlanId: resolvedValue as Id<"tradePlans"> | null }
          : { portfolioId: resolvedValue as Id<"portfolios"> | null }),
      });
      if (result.errors.length > 0) {
        setBulkError(
          `Updated ${result.updated} trade${result.updated === 1 ? "" : "s"}, but ${result.errors.length} failed.`,
        );
      } else {
        clearSelection();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bulk update failed";
      setBulkError(message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const trades = displayedTradesPage.page;
  const pageTradeIds = useMemo(
    () => new Set(trades.map((t) => t._id)),
    [trades],
  );
  const allPageSelected =
    trades.length > 0 && trades.every((t) => selectedTradeIds.has(t._id));
  const somePageSelected =
    trades.some((t) => selectedTradeIds.has(t._id)) && !allPageSelected;
  const selectionCount = selectedTradeIds.size;
  const isTickerPending =
    normalizeTradesTickerParam(tickerInput) !== appliedTicker;
  const hasActiveFilters = Boolean(
    startDateValue ||
    endDateValue ||
    appliedTicker ||
    portfolioValue ||
    accountValue,
  );

  const handleSelectAll = () => {
    if (allPageSelected) {
      setSelectedTradeIds((prev) => {
        const next = new Set(prev);
        for (const id of pageTradeIds) {
          next.delete(id);
        }
        return next;
      });
    } else {
      setSelectedTradeIds((prev) => {
        const next = new Set(prev);
        for (const id of pageTradeIds) {
          next.add(id);
        }
        return next;
      });
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.trades}
        >
          Trades
        </h1>
      </div>

      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-11">Start date</span>
            <Input
              aria-label="Start date"
              className="dark-date-input"
              dataTestId="trades-filter-start-date"
              type="date"
              value={startDateValue}
              onChange={(event) =>
                handleDateChange("startDate", event.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-11">End date</span>
            <Input
              aria-label="End date"
              className="dark-date-input"
              dataTestId="trades-filter-end-date"
              type="date"
              value={endDateValue}
              onChange={(event) =>
                handleDateChange("endDate", event.target.value)
              }
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-11">Ticker</span>
            <Input
              aria-label="Ticker"
              dataTestId="trades-filter-ticker"
              type="search"
              placeholder="Search symbols"
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
            />
            {isTickerPending ? (
              <span className="text-xs text-slate-11">Updating filter…</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-11">Portfolio</span>
            <Select
              aria-label="Portfolio"
              dataTestId="trades-filter-portfolio"
              value={portfolioValue}
              onChange={(event) => handlePortfolioChange(event.target.value)}
            >
              <option value="">Any portfolio</option>
              <option value={NO_PORTFOLIO_FILTER_VALUE}>No portfolio</option>
              {portfolios.map((portfolio) => (
                <option key={portfolio._id} value={portfolio._id}>
                  {portfolio.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-slate-11">Account</span>
            <Select
              aria-label="Account"
              dataTestId="trades-filter-account"
              value={accountValue}
              onChange={(event) => handleAccountChange(event.target.value)}
            >
              <option value="">Any account</option>
              {accountOptions.map((account) => (
                <option key={account.value} value={account.value}>
                  {account.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
      {trades.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            dataTestId="trades-filtered-empty-state"
            title="No trades match the current filters"
            description="Adjust the filters above to find trades."
          />
        ) : (
          <EmptyState
            dataTestId="trades-empty-state"
            title="No trades yet"
            description="Trades will appear here after you accept imported trades."
          />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-6">
            <table className="w-full table-auto">
              <thead className="bg-slate-3">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      data-testid={TRADES_INDEX_TEST_IDS.selectAll}
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected;
                      }}
                      onChange={handleSelectAll}
                      className="h-4 w-4 cursor-pointer appearance-none rounded border border-olive-7 bg-olive-3 checked:border-grass-9 checked:bg-grass-9 checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-[length:120%_120%] checked:bg-center checked:bg-no-repeat"
                      aria-label="Select all trades on page"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Ticker
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Trade Plan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Portfolio
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Side
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                    Price
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-11">
                    Account
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-11">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-6 bg-slate-2">
                {trades.map((trade) => {
                  let accountDisplay = "—";
                  if (
                    trade.brokerageAccountId &&
                    (trade.source === "ibkr" || trade.source === "kraken")
                  ) {
                    const accountName = accountNameByKey.get(
                      buildTradeAccountKey({
                        accountId: trade.brokerageAccountId,
                        source: trade.source,
                      }),
                    );
                    accountDisplay = getAccountBaseLabel({
                      accountId: trade.brokerageAccountId,
                      mappedName: accountName,
                      source: trade.source,
                    });
                  } else if (trade.source === "kraken") {
                    const accountName = accountNameByKey.get(
                      buildTradeAccountKey({
                        accountId: KRAKEN_DEFAULT_ACCOUNT_ID,
                        source: "kraken",
                      }),
                    );
                    accountDisplay = getAccountBaseLabel({
                      accountId: KRAKEN_DEFAULT_ACCOUNT_ID,
                      mappedName: accountName,
                      source: "kraken",
                    });
                  }

                  return (
                    <React.Fragment key={trade._id}>
                      <tr
                        className={cn({
                          "bg-amber-3/30 shadow-[inset_0_1px_0_0_var(--amber-7),inset_1px_0_0_0_var(--amber-7),inset_-1px_0_0_0_var(--amber-7)]":
                            editingTradeId === trade._id,
                          "hover:bg-slate-3/50": editingTradeId !== trade._id,
                        })}
                        data-testid={getTradeRowTestId(trade.ticker, trade.date)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            data-testid={`select-trade-${trade._id}`}
                            checked={selectedTradeIds.has(trade._id)}
                            onChange={() => toggleTradeSelection(trade._id)}
                            className="h-4 w-4 cursor-pointer appearance-none rounded border border-olive-7 bg-olive-3 checked:border-grass-9 checked:bg-grass-9 checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] checked:bg-[length:120%_120%] checked:bg-center checked:bg-no-repeat"
                            aria-label={`Select ${trade.ticker} trade`}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-12">
                          {formatDate(trade.date)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium whitespace-nowrap text-slate-12">
                          {trade.ticker}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-11">
                          {trade.tradePlanId
                            ? (tradePlanNameMap.get(trade.tradePlanId) ?? "—")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-11">
                          {trade.portfolioId
                            ? (portfolioNameMap.get(trade.portfolioId) ?? "—")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <Badge
                            variant={
                              trade.side === "buy" ? "success" : "danger"
                            }
                          >
                            {trade.side.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-11">
                          {trade.direction}
                        </td>
                        <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-slate-12">
                          {formatCurrency(trade.price)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm whitespace-nowrap text-slate-12">
                          {trade.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap text-slate-12">
                          {formatCurrency(trade.price * trade.quantity)}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap text-slate-11">
                          {accountDisplay}
                        </td>
                        <td className="px-4 py-3 text-right text-sm whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTradeId(
                                editingTradeId === trade._id ? null : trade._id,
                              )
                            }
                            className="text-slate-11 transition-colors hover:text-slate-12"
                            aria-label="Edit trade"
                            data-testid={`edit-trade-${trade._id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {editingTradeId === trade._id && (
                        <tr className="bg-amber-3/30 shadow-[inset_0_-1px_0_0_var(--amber-7),inset_1px_0_0_0_var(--amber-7),inset_-1px_0_0_0_var(--amber-7)]">
                          <td colSpan={12} className="p-0">
                            <EditTradeForm
                              tradeId={trade._id}
                              initialValues={{
                                assetType: trade.assetType,
                                date: formatDateForInput(trade.date),
                                direction: trade.direction,
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

          {selectionCount > 0 && (
            <div
              className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-olive-6 bg-olive-2 p-4"
              data-testid={TRADES_INDEX_TEST_IDS.bulkToolbar}
            >
              <span className="text-sm font-medium text-olive-12">
                {selectionCount} trade{selectionCount === 1 ? "" : "s"} selected
              </span>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-olive-11">
                  Trade Plan
                </span>
                <Select
                  dataTestId={TRADES_INDEX_TEST_IDS.bulkTradePlanSelect}
                  className="w-[220px]"
                  value=""
                  disabled={bulkUpdating}
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      void handleBulkUpdate("tradePlanId", e.target.value);
                    }
                  }}
                >
                  <option value="">— Set trade plan —</option>
                  <option value="__remove__">— Remove trade plan —</option>
                  {tradePlans.map((tp) => (
                    <option key={tp._id} value={tp._id}>
                      {tp.name} ({tp.instrumentSymbol})
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-olive-11">
                  Portfolio
                </span>
                <Select
                  dataTestId={TRADES_INDEX_TEST_IDS.bulkPortfolioSelect}
                  className="w-[200px]"
                  value=""
                  disabled={bulkUpdating}
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      void handleBulkUpdate("portfolioId", e.target.value);
                    }
                  }}
                >
                  <option value="">— Set portfolio —</option>
                  <option value="__remove__">— Remove portfolio —</option>
                  {portfolios.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </label>
              <button
                type="button"
                data-testid={TRADES_INDEX_TEST_IDS.bulkClearSelection}
                onClick={clearSelection}
                className="ml-auto flex items-center gap-1 rounded px-2 py-1.5 text-xs text-olive-11 hover:bg-olive-4 hover:text-olive-12"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}

          {bulkError && (
            <Alert variant="error" className="mt-3" onDismiss={() => setBulkError(null)}>
              {bulkError}
            </Alert>
          )}

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-olive-6 bg-olive-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-11">
              Showing {trades.length} trade{trades.length === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-3">
              <label
                className="whitespace-nowrap text-sm text-slate-11"
                htmlFor="page-size-select"
              >
                Rows per page
              </label>
              <Select
                dataTestId="trades-page-size-select"
                size="sm"
                className="w-auto"
                id="page-size-select"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                disabled={isLoadingTradesPage}
              >
                {TRADES_PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                aria-label="Previous page"
                title="Previous page"
                data-testid={TRADES_INDEX_TEST_IDS.paginationPrev}
                className="rounded border border-olive-6 p-1.5 text-slate-12 disabled:opacity-50"
                onClick={handlePrevPage}
                disabled={cursorHistory.length === 0 || isLoadingTradesPage}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="whitespace-nowrap text-sm text-slate-11">
                Page {currentPage}
              </span>
              <button
                type="button"
                aria-label="Next page"
                title="Next page"
                data-testid={TRADES_INDEX_TEST_IDS.paginationNext}
                className="rounded border border-olive-6 p-1.5 text-slate-12 disabled:opacity-50"
                onClick={handleNextPage}
                disabled={isLoadingTradesPage || displayedTradesPage.isDone}
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
