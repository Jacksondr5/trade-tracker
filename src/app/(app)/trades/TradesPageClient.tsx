"use client";

import { Preloaded, usePreloadedQuery, useQuery } from "convex/react";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Badge, EmptyState, Input, Select } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "~/lib/format";
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
  const currentPage = cursorHistory.length + 1;

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
      setAppliedTicker(normalizedTickerInput);
      setCursor(null);
      setCursorHistory([]);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [appliedTicker, tickerInput]);

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
    setPortfolioValue(value);
    setCursor(null);
    setCursorHistory([]);
  };

  const handleAccountChange = (value: string) => {
    setEditingTradeId(null);
    setAccountValue(value);
    setCursor(null);
    setCursorHistory([]);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;

    setEditingTradeId(null);
    const nextCursorHistory = cursorHistory.slice(0, -1);
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursor(previousCursor);
    setCursorHistory(nextCursorHistory);
  };

  const handleNextPage = () => {
    if (!tradesPage || tradesPage.isDone) return;

    setEditingTradeId(null);
    setCursorHistory([...cursorHistory, cursor]);
    setCursor(tradesPage.continueCursor);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setEditingTradeId(null);
    setPageSize(normalizeTradesPageSize(nextPageSize));
    setCursor(null);
    setCursorHistory([]);
  };

  const trades = displayedTradesPage.page;
  const isTickerPending =
    normalizeTradesTickerParam(tickerInput) !== appliedTicker;
  const hasActiveFilters = Boolean(
    startDateValue ||
    endDateValue ||
    appliedTicker ||
    portfolioValue ||
    accountValue,
  );

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
                        className="hover:bg-slate-3/50"
                        data-testid={getTradeRowTestId(trade.ticker, trade.date)}
                      >
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
                        <tr>
                          <td colSpan={11} className="px-4 py-3">
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
