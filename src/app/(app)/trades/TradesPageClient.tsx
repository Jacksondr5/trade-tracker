"use client";

import { Preloaded, usePreloadedQuery, useQuery } from "convex/react";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Badge, Button, Input } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "~/lib/format";
import {
  DEFAULT_TRADES_PAGE_SIZE,
  TRADES_PAGE_SIZE_OPTIONS,
  normalizeTradesPageSize,
} from "~/lib/trades/pagination";
import {
  NO_PORTFOLIO_FILTER_VALUE,
  buildTradeAccountKey,
  buildTradesPageQueryArgs,
  normalizeTradesTickerParam,
} from "~/lib/trades/filters";
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

type BrokerageSource = "ibkr" | "kraken";

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
  preloadedAccountMappings,
  preloadedKnownAccounts,
  preloadedPortfolios,
  preloadedTradesPage,
  preloadedTradePlans,
}: {
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
  const [editingTradeId, setEditingTradeId] = useState<Id<"trades"> | null>(null);
  const [lastResolvedTradesPage, setLastResolvedTradesPage] = useState(
    initialTradesPage,
  );
  const [startDateValue, setStartDateValue] = useState("");
  const [endDateValue, setEndDateValue] = useState("");
  const [tickerInput, setTickerInput] = useState("");
  const [appliedTicker, setAppliedTicker] = useState<string | null>(null);
  const [portfolioValue, setPortfolioValue] = useState("");
  const [accountValue, setAccountValue] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const [pageSize, setPageSize] = useState(DEFAULT_TRADES_PAGE_SIZE);
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
        (a, b) => a.label.localeCompare(b.label) || a.value.localeCompare(b.value),
      );
  }, [accountNameByKey, knownAccounts]);

  useEffect(() => {
    const normalizedTickerInput = normalizeTradesTickerParam(tickerInput);
    if (normalizedTickerInput === appliedTicker) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
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
    !startDateValue &&
    !endDateValue &&
    !appliedTicker &&
    !portfolioValue &&
    !accountValue &&
    cursor === null &&
    pageSize === DEFAULT_TRADES_PAGE_SIZE;

  const queriedTradesPage = useQuery(
    api.trades.listTradesPage,
    isUsingInitialTradesPage ? "skip" : queryArgs,
  );
  const tradesPage = isUsingInitialTradesPage ? initialTradesPage : queriedTradesPage;

  useEffect(() => {
    if (tradesPage) {
      setLastResolvedTradesPage(tradesPage);
    }
  }, [tradesPage]);

  const displayedTradesPage = tradesPage ?? lastResolvedTradesPage;
  const isLoadingTradesPage = !tradesPage;

  const handleDateChange = (type: "startDate" | "endDate", value: string) => {
    if (type === "startDate") {
      setStartDateValue(value);
    } else {
      setEndDateValue(value);
    }
    setCursor(null);
    setCursorHistory([]);
  };

  const handlePortfolioChange = (value: string) => {
    setPortfolioValue(value);
    setCursor(null);
    setCursorHistory([]);
  };

  const handleAccountChange = (value: string) => {
    setAccountValue(value);
    setCursor(null);
    setCursorHistory([]);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;

    const nextCursorHistory = cursorHistory.slice(0, -1);
    const previousCursor = cursorHistory[cursorHistory.length - 1];
    setCursor(previousCursor);
    setCursorHistory(nextCursorHistory);
  };

  const handleNextPage = () => {
    if (!tradesPage || tradesPage.isDone) return;

    setCursorHistory([...cursorHistory, cursor]);
    setCursor(tradesPage.continueCursor);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(normalizeTradesPageSize(nextPageSize));
    setCursor(null);
    setCursorHistory([]);
  };

  const trades = displayedTradesPage.page;
  const hasActiveFilters = Boolean(
    startDateValue || endDateValue || appliedTicker || portfolioValue || accountValue,
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-slate-12 text-2xl font-bold">Trades</h1>
        <Link href="/trades/new">
          <Button dataTestId="new-trade-button">New Trade</Button>
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-2">
            <span className="text-slate-11 text-sm">Start date</span>
            <Input
              aria-label="Start date"
              className="dark-date-input"
              dataTestId="trades-filter-start-date"
              type="date"
              value={startDateValue}
              onChange={(event) => handleDateChange("startDate", event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-slate-11 text-sm">End date</span>
            <Input
              aria-label="End date"
              className="dark-date-input"
              dataTestId="trades-filter-end-date"
              type="date"
              value={endDateValue}
              onChange={(event) => handleDateChange("endDate", event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-slate-11 text-sm">Ticker</span>
            <Input
              aria-label="Ticker"
              dataTestId="trades-filter-ticker"
              type="search"
              placeholder="Search symbols"
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-slate-11 text-sm">Portfolio</span>
            <select
              aria-label="Portfolio"
              data-testid="trades-filter-portfolio"
              className="text-slate-12 block h-9 w-full rounded-md border border-olive-7 bg-transparent px-3 text-sm shadow-xs focus:border-blue-500 focus:outline-none"
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
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-slate-11 text-sm">Account</span>
            <select
              aria-label="Account"
              data-testid="trades-filter-account"
              className="text-slate-12 block h-9 w-full rounded-md border border-olive-7 bg-transparent px-3 text-sm shadow-xs focus:border-blue-500 focus:outline-none"
              value={accountValue}
              onChange={(event) => handleAccountChange(event.target.value)}
            >
              <option value="">Any account</option>
              {accountOptions.map((account) => (
                <option key={account.value} value={account.value}>
                  {account.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {trades.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
          <p className="text-slate-11">
            {hasActiveFilters
              ? "No trades found for the selected filters."
              : "No trades yet."}
          </p>
          {!hasActiveFilters && (
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
                        accountId: "default",
                        source: "kraken",
                      }),
                    );
                    accountDisplay = getAccountBaseLabel({
                      accountId: "default",
                      mappedName: accountName,
                      source: "kraken",
                    });
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
                disabled={isLoadingTradesPage}
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
                disabled={cursorHistory.length === 0 || isLoadingTradesPage}
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
