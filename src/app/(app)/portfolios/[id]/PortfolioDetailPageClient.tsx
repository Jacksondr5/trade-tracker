"use client";

import * as Plot from "@observablehq/plot";
import { ConvexError } from "convex/values";
import {
  Preloaded,
  useMutation,
  usePreloadedQuery,
  useQuery,
} from "convex/react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Select,
  Skeleton,
  type BadgeProps,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { capitalize, formatCurrency, formatDate } from "~/lib/format";
import {
  PORTFOLIO_CAMPAIGN_EXPOSURE_UNCOVERED_ROW_TEST_ID,
  PORTFOLIO_DATA_ISSUES_TEST_IDS,
  PORTFOLIO_DETAIL_TEST_IDS,
  getPortfolioCampaignExposureLinkTestId,
  getPortfolioCampaignExposureRowTestId,
  getPortfolioOpenPositionRowTestId,
  getPortfolioRecentTradeRowTestId,
} from "../../../../../shared/e2e/testIds";
import PortfolioCashLedgerSection from "./PortfolioCashLedgerSection";

const TIMEFRAME_OPTIONS = [
  { days: 7, label: "Last 7 days", value: "7d" },
  { days: 30, label: "Last 30 days", value: "30d" },
  { days: 90, label: "Last 90 days", value: "90d" },
  { days: 180, label: "Last 6 months", value: "180d" },
  { days: 365, label: "Last 1 year", value: "1y" },
] as const;

type TimeframeValue = (typeof TIMEFRAME_OPTIONS)[number]["value"];

const RECENT_TRADES_LIMIT = 8;

type CampaignStatus = "planning" | "active" | "closed";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

type BrokerageFreshnessStatus =
  | "current"
  | "pending_review"
  | "stale"
  | "mismatched"
  | "unmanaged";

function getCampaignStatusVariant(status: CampaignStatus): BadgeVariant {
  switch (status) {
    case "planning":
      return "info";
    case "active":
      return "success";
    case "closed":
    default:
      return "neutral";
  }
}

function getBrokerageFreshnessLabel(status: BrokerageFreshnessStatus): string {
  switch (status) {
    case "current":
      return "Brokerage current";
    case "pending_review":
      return "Brokerage pending review";
    case "stale":
      return "Brokerage stale";
    case "mismatched":
      return "Brokerage mismatch";
    case "unmanaged":
    default:
      return "Brokerage unmanaged";
  }
}

function getBrokerageFreshnessVariant(
  status: BrokerageFreshnessStatus,
): BadgeVariant {
  switch (status) {
    case "current":
      return "success";
    case "pending_review":
      return "warning";
    case "stale":
      return "warning";
    case "mismatched":
      return "danger";
    case "unmanaged":
    default:
      return "neutral";
  }
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(2)}%`;
}

function formatIsoDateForDisplay(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00.000Z`);
  return parsed.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

type PositionPriceStatus =
  | "ok"
  | "needs_mapping"
  | "awaiting_snapshot"
  | "no_valuation";

function getPriceStatusTitle(status: PositionPriceStatus): string {
  switch (status) {
    case "needs_mapping":
      return "Needs Market Data mapping. See Data issues at the top of this page.";
    case "awaiting_snapshot":
      return "Mapped, awaiting next daily price refresh. See Data issues at the top of this page.";
    case "no_valuation":
      return "Market value will appear after the first daily valuation runs.";
    case "ok":
    default:
      return "Market value priced from the latest daily snapshot.";
  }
}

function getPriceStatusAriaLabel(
  status: PositionPriceStatus,
  ticker: string,
): string {
  switch (status) {
    case "needs_mapping":
      return `${ticker} market value pending: needs Market Data mapping.`;
    case "awaiting_snapshot":
      return `${ticker} market value pending: awaiting next daily price refresh.`;
    case "no_valuation":
      return `${ticker} market value pending: portfolio has no valuation yet.`;
    case "ok":
    default:
      return `${ticker} market value`;
  }
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export default function PortfolioDetailPageClient({
  portfolioId,
  preloadedPortfolioOverview,
}: {
  portfolioId: Id<"portfolios">;
  preloadedPortfolioOverview: Preloaded<
    typeof api.portfolios.getPortfolioOverview
  >;
}) {
  const router = useRouter();
  const overview = usePreloadedQuery(preloadedPortfolioOverview);

  const updatePortfolio = useMutation(api.portfolios.updatePortfolio);
  const deletePortfolio = useMutation(api.portfolios.deletePortfolio);

  const [timeframe, setTimeframe] = useState<TimeframeValue>("30d");
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const portfolio = overview?.portfolio ?? null;

  useEffect(() => {
    if (portfolio && !isEditingName) {
      setDraftName(portfolio.name);
    }
  }, [portfolio, isEditingName]);

  const timeframeWindow = useMemo(() => {
    if (!overview || overview.asOfDate === null) {
      return null;
    }
    const option =
      TIMEFRAME_OPTIONS.find((entry) => entry.value === timeframe) ??
      TIMEFRAME_OPTIONS[1];
    const endDate = overview.asOfDate;
    const startDate = shiftIsoDate(endDate, -option.days);
    return { endDate, label: option.label, startDate };
  }, [overview, timeframe]);

  const equitySeries = useQuery(
    api.portfolioAnalytics.listEquitySeries,
    timeframeWindow
      ? {
          endDate: timeframeWindow.endDate,
          portfolioId,
          startDate: timeframeWindow.startDate,
        }
      : "skip",
  );

  const seriesFirst = equitySeries?.[0];
  const seriesLast =
    equitySeries && equitySeries.length > 0
      ? equitySeries[equitySeries.length - 1]
      : undefined;

  const timeframeReturn = useQuery(
    api.portfolioAnalytics.getTimeframeReturn,
    seriesFirst &&
      seriesLast &&
      seriesFirst.date !== seriesLast.date &&
      timeframeWindow !== null
      ? {
          endDate: seriesLast.date,
          portfolioId,
          startDate: seriesFirst.date,
        }
      : "skip",
  );

  const handleStartEditName = () => {
    if (!portfolio) return;
    setDraftName(portfolio.name);
    setNameError(null);
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
    if (!portfolio) return;
    setIsEditingName(false);
    setDraftName(portfolio.name);
    setNameError(null);
  };

  const handleSaveName = async () => {
    if (!portfolio) return;
    const trimmed = draftName.trim();
    if (!trimmed) {
      setNameError("Portfolio name cannot be empty");
      return;
    }
    setIsSavingName(true);
    setNameError(null);
    try {
      await updatePortfolio({ name: trimmed, portfolioId });
      setIsEditingName(false);
    } catch (error) {
      setNameError(describeError(error, "Failed to save portfolio name"));
    } finally {
      setIsSavingName(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deletePortfolio({ portfolioId });
      router.push("/portfolios");
    } catch (error) {
      setDeleteError(describeError(error, "Failed to delete portfolio"));
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (overview === null || portfolio === null) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 md:px-6">
        <Alert variant="info" className="max-w-md">
          Portfolio not found.
        </Alert>
        <Button
          asChild
          variant="link"
          className="mt-4 px-0 text-sm"
          dataTestId={PORTFOLIO_DETAIL_TEST_IDS.backLink}
        >
          <Link href="/portfolios">Back to portfolios</Link>
        </Button>
      </div>
    );
  }

  const {
    awaitingSnapshotSymbols,
    campaignExposure,
    latestValuation,
    needsMappingSymbols,
    openPositions,
  } = overview;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <Link
        href="/portfolios"
        className="mb-3 inline-block text-sm text-olive-11 hover:text-olive-12"
        data-testid={PORTFOLIO_DETAIL_TEST_IDS.backLink}
      >
        &larr; Back to Portfolios
      </Link>

      {/* Title row */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          {isEditingName ? (
            <div className="space-y-2">
              <input
                aria-label="Portfolio name"
                className="w-full max-w-md rounded-md border border-olive-7 bg-olive-2 px-3 py-2 text-2xl font-bold text-olive-12 focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:outline-hidden md:text-3xl"
                data-testid={PORTFOLIO_DETAIL_TEST_IDS.nameInput}
                maxLength={120}
                onChange={(event) => setDraftName(event.target.value)}
                value={draftName}
              />
              <div className="flex items-center gap-2">
                <button
                  aria-label="Save portfolio name"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-olive-6 text-grass-9 hover:bg-grass-3 disabled:opacity-50"
                  data-testid={PORTFOLIO_DETAIL_TEST_IDS.saveNameButton}
                  disabled={isSavingName}
                  onClick={() => void handleSaveName()}
                  title="Save"
                  type="button"
                >
                  {isSavingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
                <button
                  aria-label="Cancel editing portfolio name"
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-olive-6 text-olive-11 hover:bg-olive-4 hover:text-olive-12 disabled:opacity-50"
                  data-testid={PORTFOLIO_DETAIL_TEST_IDS.cancelEditNameButton}
                  disabled={isSavingName}
                  onClick={handleCancelEditName}
                  title="Cancel"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {nameError && (
                <Alert
                  variant="error"
                  className="mt-2"
                  onDismiss={() => setNameError(null)}
                >
                  {nameError}
                </Alert>
              )}
            </div>
          ) : (
            <div className="group flex items-center gap-2">
              <h1
                className="truncate text-2xl font-bold text-olive-12 md:text-3xl"
                data-testid={PORTFOLIO_DETAIL_TEST_IDS.nameDisplay}
              >
                {portfolio.name}
              </h1>
              <button
                aria-label="Edit portfolio name"
                className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12 md:opacity-0 md:group-hover:opacity-100"
                data-testid={PORTFOLIO_DETAIL_TEST_IDS.editNameButton}
                onClick={handleStartEditName}
                title="Edit name"
                type="button"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          {!isEditingName && overview.asOfDate ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p
                className="text-sm text-olive-11"
                data-testid={PORTFOLIO_DETAIL_TEST_IDS.asOfDate}
              >
                Valuation as of {formatIsoDateForDisplay(overview.asOfDate)} ·{" "}
                {overview.tradeCount} trade
                {overview.tradeCount === 1 ? "" : "s"}
              </p>
              {latestValuation ? (
                <Badge
                  data-testid={
                    PORTFOLIO_DETAIL_TEST_IDS.portfolioFreshnessStatus
                  }
                  variant={getBrokerageFreshnessVariant(
                    latestValuation.brokerageFreshnessStatus,
                  )}
                >
                  {getBrokerageFreshnessLabel(
                    latestValuation.brokerageFreshnessStatus,
                  )}
                </Badge>
              ) : null}
            </div>
          ) : !isEditingName ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p
                className="text-sm text-olive-11"
                data-testid={PORTFOLIO_DETAIL_TEST_IDS.asOfDate}
              >
                No valuations yet · {overview.tradeCount} trade
                {overview.tradeCount === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}
        </div>

        {!isEditingName && (
          <div className="flex items-center gap-2">
            {showDeleteConfirm ? (
              <>
                <button
                  aria-label="Confirm delete portfolio"
                  className="flex h-9 items-center gap-1.5 rounded-md border border-red-7 bg-red-3 px-3 text-sm font-medium text-red-11 hover:bg-red-4 disabled:opacity-50"
                  data-testid={PORTFOLIO_DETAIL_TEST_IDS.confirmDeleteButton}
                  disabled={isDeleting}
                  onClick={() => void handleConfirmDelete()}
                  type="button"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Confirm
                </button>
                <button
                  aria-label="Cancel delete portfolio"
                  className="flex h-9 items-center gap-1.5 rounded-md border border-olive-6 bg-olive-3 px-3 text-sm text-olive-12 hover:bg-olive-4"
                  data-testid={PORTFOLIO_DETAIL_TEST_IDS.cancelDeleteButton}
                  onClick={() => setShowDeleteConfirm(false)}
                  type="button"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                aria-label="Delete portfolio"
                className="flex h-9 items-center gap-1.5 rounded-md border border-olive-6 bg-olive-3 px-3 text-sm text-olive-12 hover:bg-olive-4"
                data-testid={PORTFOLIO_DETAIL_TEST_IDS.deleteButton}
                onClick={() => setShowDeleteConfirm(true)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {deleteError && (
        <Alert
          variant="error"
          className="mb-4"
          onDismiss={() => setDeleteError(null)}
        >
          {deleteError}
        </Alert>
      )}

      <DataIssuesPanel
        asOfDate={overview.asOfDate}
        awaitingSnapshotSymbols={awaitingSnapshotSymbols}
        campaignExposure={campaignExposure}
        needsMappingSymbols={needsMappingSymbols}
        uncoveredTradeCount={overview.uncoveredExposure.tradeCount}
      />

      {/* Summary cards */}
      <section
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid={PORTFOLIO_DETAIL_TEST_IDS.summarySection}
      >
        <SummaryStat
          dataTestId={PORTFOLIO_DETAIL_TEST_IDS.summaryCash}
          label="Cash"
          tone="grass"
          value={
            latestValuation ? formatCurrency(latestValuation.cashBalance) : "—"
          }
        />
        <SummaryStat
          dataTestId={PORTFOLIO_DETAIL_TEST_IDS.summaryMarketValue}
          label="Market Value"
          tone="blue"
          subtle={
            latestValuation &&
            latestValuation.priceCoverageStatus !== "complete"
              ? capitalize(latestValuation.priceCoverageStatus) + " coverage"
              : null
          }
          value={
            latestValuation ? formatCurrency(latestValuation.marketValue) : "—"
          }
        />
        <SummaryStat
          dataTestId={PORTFOLIO_DETAIL_TEST_IDS.summaryTotalEquity}
          label="Total Equity"
          tone="default"
          value={
            latestValuation ? formatCurrency(latestValuation.totalEquity) : "—"
          }
        />
        <SummaryStat
          dataTestId={PORTFOLIO_DETAIL_TEST_IDS.returnPercent}
          label={`Return (${TIMEFRAME_OPTIONS.find((opt) => opt.value === timeframe)?.label ?? "period"})`}
          tone={
            timeframeReturn?.returnPercent !== undefined &&
            timeframeReturn?.returnPercent !== null &&
            timeframeReturn.returnPercent < 0
              ? "red"
              : "grass"
          }
          subtle={
            timeframeReturn && timeframeReturn.netExternalCashFlow !== 0
              ? `Net cash ${formatCurrency(timeframeReturn.netExternalCashFlow)}`
              : null
          }
          value={
            timeframeReturn === undefined
              ? "—"
              : timeframeReturn === null
                ? "—"
                : formatPercent(timeframeReturn.returnPercent)
          }
        />
      </section>

      {/* Equity history chart */}
      <section
        className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
        data-testid={PORTFOLIO_DETAIL_TEST_IDS.equityChartSection}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-olive-12">
            Equity history
          </h2>
          <div className="flex items-center gap-2">
            <label
              className="text-xs font-medium tracking-wide text-olive-11 uppercase"
              htmlFor="portfolio-timeframe-select"
            >
              Timeframe
            </label>
            <div className="w-44">
              <Select
                dataTestId={PORTFOLIO_DETAIL_TEST_IDS.timeframeSelect}
                id="portfolio-timeframe-select"
                onChange={(event) =>
                  setTimeframe(event.target.value as TimeframeValue)
                }
                size="sm"
                value={timeframe}
              >
                {TIMEFRAME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {timeframeWindow === null ? (
          <p
            className="text-sm text-olive-11"
            data-testid={PORTFOLIO_DETAIL_TEST_IDS.emptyValuationState}
          >
            No valuations yet. Equity history will appear here after the first
            daily valuation runs for this portfolio.
          </p>
        ) : equitySeries === undefined ? (
          <Skeleton
            aria-busy="true"
            aria-label="Loading equity history"
            className="h-48 w-full rounded-md"
          />
        ) : equitySeries.length === 0 ? (
          <p
            className="text-sm text-olive-11"
            data-testid={PORTFOLIO_DETAIL_TEST_IDS.equityChartEmpty}
          >
            No valuations recorded for this timeframe.
          </p>
        ) : (
          <EquityChart series={equitySeries} />
        )}
      </section>

      {/* Allocation */}
      <section
        className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
        data-testid={PORTFOLIO_DETAIL_TEST_IDS.allocationSection}
      >
        <h2 className="mb-3 text-lg font-semibold text-olive-12">Allocation</h2>
        {latestValuation ? (
          <AllocationBar valuation={latestValuation} />
        ) : (
          <p className="text-sm text-olive-11">
            Allocation will appear once the first daily valuation has been
            computed.
          </p>
        )}
      </section>

      {/* Open positions */}
      <section
        className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
        data-testid={PORTFOLIO_DETAIL_TEST_IDS.openPositionsSection}
      >
        <h2 className="mb-3 text-lg font-semibold text-olive-12">
          Open positions
        </h2>
        {openPositions.length === 0 ? (
          <p
            className="text-sm text-olive-11"
            data-testid={PORTFOLIO_DETAIL_TEST_IDS.openPositionsEmpty}
          >
            No open positions in this portfolio.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-6 bg-slate-2">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-slate-6 text-left text-slate-11">
                  <th className="px-3 py-2 font-medium">Ticker</th>
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Direction</th>
                  <th className="px-3 py-2 text-right font-medium">Quantity</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Market value
                  </th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((position) => (
                  <tr
                    className="border-b border-slate-6/60 last:border-b-0"
                    data-testid={getPortfolioOpenPositionRowTestId(
                      position.assetType,
                      position.ticker,
                      position.direction,
                    )}
                    key={`${position.assetType}-${position.ticker}-${position.direction}`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-12">
                      {position.ticker}
                    </td>
                    <td className="px-3 py-2 text-slate-11">
                      {capitalize(position.assetType)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          position.direction === "long" ? "success" : "danger"
                        }
                      >
                        {capitalize(position.direction)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-11">
                      {position.quantity}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-12">
                      {position.hasPrice && position.marketValue !== null ? (
                        formatCurrency(position.marketValue)
                      ) : (
                        <span
                          aria-label={getPriceStatusAriaLabel(
                            position.priceStatus,
                            position.ticker,
                          )}
                          className="text-slate-11"
                          title={getPriceStatusTitle(position.priceStatus)}
                        >
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Campaign exposure */}
      <section
        className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
        data-testid={PORTFOLIO_DETAIL_TEST_IDS.campaignExposureSection}
      >
        <h2 className="mb-3 text-lg font-semibold text-olive-12">
          Campaign exposure
        </h2>

        {campaignExposure.length === 0 &&
        overview.uncoveredExposure.tradeCount === 0 ? (
          <p
            className="text-sm text-olive-11"
            data-testid={PORTFOLIO_DETAIL_TEST_IDS.campaignExposureEmpty}
          >
            No campaigns are linked through this portfolio&apos;s trades yet.
            Link trades to a trade plan and a campaign to see exposure here.
          </p>
        ) : (
          <ul className="space-y-2">
            {campaignExposure.map((row) => (
              <li
                className="flex flex-col gap-2 rounded-md border border-olive-6 bg-olive-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={getPortfolioCampaignExposureRowTestId(row._id)}
                key={row._id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="font-medium text-olive-12 hover:underline"
                      data-testid={getPortfolioCampaignExposureLinkTestId(
                        row._id,
                      )}
                      href={`/campaigns/${row._id}`}
                    >
                      {row.name}
                    </Link>
                    <Badge variant={getCampaignStatusVariant(row.status)}>
                      {capitalize(row.status)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-olive-11">
                    {row.openPositionCount} open position
                    {row.openPositionCount === 1 ? "" : "s"} · {row.tradeCount}{" "}
                    trade
                    {row.tradeCount === 1 ? "" : "s"}
                    {row.tickers.length > 0
                      ? ` · ${row.tickers.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums sm:text-right">
                  <div>
                    <p className="text-xs text-olive-11">Exposure</p>
                    <p className="font-medium text-olive-12">
                      {row.exposureValue !== null
                        ? formatCurrency(row.exposureValue)
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-olive-11">Share</p>
                    <p className="font-medium text-olive-12">
                      {row.sharePercent !== null
                        ? formatPercent(row.sharePercent)
                        : "—"}
                    </p>
                  </div>
                </div>
              </li>
            ))}
            {overview.uncoveredExposure.tradeCount > 0 ||
            overview.uncoveredExposure.openPositionCount > 0 ? (
              <li
                className="flex flex-col gap-2 rounded-md border border-dashed border-olive-6 bg-olive-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                data-testid={PORTFOLIO_CAMPAIGN_EXPOSURE_UNCOVERED_ROW_TEST_ID}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="font-medium text-olive-12 italic"
                      title="Trades whose trade plan has no campaign — included in the portfolio total but not in any campaign."
                    >
                      Trades not in a campaign
                    </span>
                    <Badge variant="neutral">Unlinked</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-olive-11">
                    {overview.uncoveredExposure.openPositionCount} open position
                    {overview.uncoveredExposure.openPositionCount === 1
                      ? ""
                      : "s"}{" "}
                    · {overview.uncoveredExposure.tradeCount} trade
                    {overview.uncoveredExposure.tradeCount === 1 ? "" : "s"}
                    {overview.uncoveredExposure.tickers.length > 0
                      ? ` · ${overview.uncoveredExposure.tickers.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm tabular-nums sm:text-right">
                  <div>
                    <p className="text-xs text-olive-11">Exposure</p>
                    <p className="font-medium text-olive-12">
                      {overview.uncoveredExposure.exposureValue !== null
                        ? formatCurrency(
                            overview.uncoveredExposure.exposureValue,
                          )
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-olive-11">Share</p>
                    <p className="font-medium text-olive-12">
                      {overview.uncoveredExposure.sharePercent !== null
                        ? formatPercent(overview.uncoveredExposure.sharePercent)
                        : "—"}
                    </p>
                  </div>
                </div>
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <PortfolioCashLedgerSection portfolioId={portfolioId} />

      {/* Recent trades */}
      <RecentTradesSection portfolioId={portfolioId} />
    </div>
  );
}

type CampaignExposureRow = {
  _id: Id<"campaigns">;
  awaitingSnapshotSymbols: string[];
  name: string;
  needsMappingSymbols: string[];
};

function DataIssuesPanel({
  asOfDate,
  awaitingSnapshotSymbols,
  campaignExposure,
  needsMappingSymbols,
  uncoveredTradeCount,
}: {
  asOfDate: string | null;
  awaitingSnapshotSymbols: string[];
  campaignExposure: ReadonlyArray<CampaignExposureRow>;
  needsMappingSymbols: string[];
  uncoveredTradeCount: number;
}) {
  const totalIssues =
    needsMappingSymbols.length +
    awaitingSnapshotSymbols.length +
    (uncoveredTradeCount > 0 ? 1 : 0);
  if (totalIssues === 0) {
    return null;
  }

  const campaignsBySymbol = (symbol: string): CampaignExposureRow[] => {
    return campaignExposure.filter(
      (row) =>
        row.needsMappingSymbols.includes(symbol) ||
        row.awaitingSnapshotSymbols.includes(symbol),
    );
  };

  const renderSymbolList = (symbols: string[]) => (
    <ul className="mt-2 space-y-1.5">
      {symbols.map((symbol) => {
        const campaigns = campaignsBySymbol(symbol);
        return (
          <li
            key={symbol}
            className="flex flex-col gap-1 text-sm text-olive-12 sm:flex-row sm:items-baseline sm:gap-2"
          >
            <span className="font-medium tabular-nums">{symbol}</span>
            <span className="text-olive-11">
              {campaigns.length === 0 ? (
                "Not linked to a campaign"
              ) : (
                <>
                  Used by{" "}
                  {campaigns.map((campaign, index) => (
                    <span key={campaign._id}>
                      {index > 0 ? ", " : null}
                      <Link
                        className="text-olive-12 underline underline-offset-2 hover:text-blue-11"
                        href={`/campaigns/${campaign._id}`}
                      >
                        {campaign.name}
                      </Link>
                    </span>
                  ))}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section
      className="mb-6 rounded-lg border border-amber-7 bg-amber-3/40 p-4"
      data-testid={PORTFOLIO_DATA_ISSUES_TEST_IDS.panel}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-amber-12">
          Data issues ({totalIssues})
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-11">
          <span>
            Resolve these to get accurate market value, allocation, and
            exposure.
          </span>
          <Link
            className="font-medium text-amber-11 underline underline-offset-2 hover:text-amber-12"
            data-testid={PORTFOLIO_DATA_ISSUES_TEST_IDS.marketDataHealthLink}
            href="/market-data/health"
          >
            Open Market Data Health →
          </Link>
        </div>
      </div>
      <div className="space-y-4">
        {needsMappingSymbols.length > 0 ? (
          <div
            className="rounded-md border border-amber-6 bg-amber-2 p-3"
            data-testid={PORTFOLIO_DATA_ISSUES_TEST_IDS.needsMappingGroup}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-amber-12">
                Symbols need Market Data mapping ({needsMappingSymbols.length})
              </p>
              <Link
                className="text-sm font-medium text-amber-11 underline underline-offset-2 hover:text-amber-12"
                href="/market-data"
              >
                Open Market Data →
              </Link>
            </div>
            <p className="mt-1 text-sm text-olive-11">
              Pick a provider symbol so daily prices can be fetched. Until this
              is resolved, market value treats these positions as unpriced.
            </p>
            {renderSymbolList(needsMappingSymbols)}
          </div>
        ) : null}
        {awaitingSnapshotSymbols.length > 0 ? (
          <div
            className="rounded-md border border-blue-6 bg-blue-2 p-3"
            data-testid={PORTFOLIO_DATA_ISSUES_TEST_IDS.awaitingSnapshotGroup}
          >
            <p className="font-semibold text-blue-12">
              Symbols awaiting next price refresh (
              {awaitingSnapshotSymbols.length})
            </p>
            <p className="mt-1 text-sm text-olive-11">
              These symbols are mapped, but no daily close has been fetched yet
              {asOfDate ? (
                <>
                  {" "}
                  for <span className="font-medium">{asOfDate}</span>
                </>
              ) : null}
              . The next nightly refresh should fill these in.
            </p>
            {renderSymbolList(awaitingSnapshotSymbols)}
          </div>
        ) : null}
        {uncoveredTradeCount > 0 ? (
          <div
            className="rounded-md border border-olive-6 bg-olive-1 p-3"
            data-testid={PORTFOLIO_DATA_ISSUES_TEST_IDS.uncoveredTradesGroup}
          >
            <p className="font-semibold text-olive-12">
              Trades not linked to a campaign ({uncoveredTradeCount})
            </p>
            <p className="mt-1 text-sm text-olive-11">
              These trades count toward the portfolio total but don&apos;t show
              up in campaign exposure. Link them to a trade plan to include
              them.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryStat({
  dataTestId,
  label,
  tone,
  subtle,
  value,
}: {
  dataTestId: string;
  label: string;
  tone: "grass" | "blue" | "red" | "default";
  subtle?: string | null;
  value: string;
}) {
  const accent =
    tone === "grass"
      ? "text-grass-11"
      : tone === "blue"
        ? "text-blue-11"
        : tone === "red"
          ? "text-red-11"
          : "text-olive-12";
  return (
    <div
      className="rounded-lg border border-olive-6 bg-olive-2 p-4"
      data-testid={dataTestId}
    >
      <p className="text-xs font-medium tracking-wide text-olive-11 uppercase">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>
        {value}
      </p>
      {subtle ? <p className="mt-1 text-xs text-olive-11">{subtle}</p> : null}
    </div>
  );
}

function AllocationBar({
  valuation,
}: {
  valuation: {
    cashBalance: number;
    marketValue: number;
    totalEquity: number;
  };
}) {
  const cash = Math.max(0, valuation.cashBalance);
  const market = Math.max(0, valuation.marketValue);
  const total = cash + market;
  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  const marketPct = total > 0 ? (market / total) * 100 : 0;
  const totalEquity = valuation.totalEquity;

  return (
    <div className="space-y-3">
      <div
        aria-label="Allocation breakdown"
        className="flex h-3 w-full overflow-hidden rounded-full border border-olive-6 bg-olive-3"
        role="img"
      >
        {total === 0 ? null : (
          <>
            <div
              className="h-full bg-grass-9"
              style={{ width: `${cashPct}%` }}
            />
            <div
              className="h-full bg-blue-9"
              style={{ width: `${marketPct}%` }}
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div data-testid={PORTFOLIO_DETAIL_TEST_IDS.allocationCash}>
          <p className="text-xs text-olive-11">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-grass-9" />
            Cash · {cashPct.toFixed(1)}%
          </p>
          <p className="font-medium text-olive-12 tabular-nums">
            {formatCurrency(valuation.cashBalance)}
          </p>
        </div>
        <div data-testid={PORTFOLIO_DETAIL_TEST_IDS.allocationMarketValue}>
          <p className="text-xs text-olive-11">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-9" />
            Market value · {marketPct.toFixed(1)}%
          </p>
          <p className="font-medium text-olive-12 tabular-nums">
            {formatCurrency(valuation.marketValue)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-olive-11">Total equity</p>
          <p className="font-semibold text-olive-12 tabular-nums">
            {formatCurrency(totalEquity)}
          </p>
        </div>
      </div>
    </div>
  );
}

type EquityChartRow = {
  cashBalance: number;
  date: string;
  marketValue: number;
  priceCoverageStatus: "complete" | "missing" | "partial";
  totalEquity: number;
};

function EquityChart({ series }: { series: Array<EquityChartRow> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useMemo(
    () =>
      series.map((row) => ({
        cashBalance: row.cashBalance,
        date: new Date(`${row.date}T00:00:00.000Z`),
        isoDate: row.date,
        marketValue: row.marketValue,
        priceCoverageStatus: row.priceCoverageStatus,
        totalEquity: row.totalEquity,
      })),
    [series],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) {
      return;
    }

    let chart: Element | null = null;

    const render = () => {
      const width = Math.max(container.clientWidth, 240);
      const useDots = data.length === 1;
      const tipFormat = (d: (typeof data)[number]) =>
        [
          d.isoDate,
          `Total equity ${formatCurrency(d.totalEquity)}`,
          `Cash ${formatCurrency(d.cashBalance)}`,
          `Market value ${formatCurrency(d.marketValue)}`,
          d.priceCoverageStatus !== "complete"
            ? `Coverage: ${d.priceCoverageStatus}`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

      const next = Plot.plot({
        width,
        height: 200,
        marginTop: 12,
        marginBottom: 28,
        marginLeft: 64,
        marginRight: 16,
        style: {
          background: "transparent",
          color: "var(--color-olive-11)",
          fontFamily: "inherit",
          fontSize: "11px",
        },
        x: {
          type: "utc",
          label: null,
          ticks: 5,
        },
        y: {
          label: null,
          grid: true,
          tickFormat: (value: number) =>
            new Intl.NumberFormat("en-US", {
              currency: "USD",
              maximumFractionDigits: 0,
              notation: "compact",
              style: "currency",
            }).format(value),
        },
        marks: [
          Plot.areaY(data, {
            x: "date",
            y: "totalEquity",
            fill: "var(--color-blue-9)",
            fillOpacity: 0.18,
            curve: "monotone-x",
          }),
          Plot.lineY(data, {
            x: "date",
            y: "totalEquity",
            stroke: "var(--color-blue-10)",
            strokeWidth: 2,
            curve: "monotone-x",
          }),
          ...(useDots
            ? [
                Plot.dot(data, {
                  x: "date",
                  y: "totalEquity",
                  fill: "var(--color-blue-10)",
                  r: 3,
                }),
              ]
            : []),
          Plot.ruleY([0], { stroke: "var(--color-olive-6)" }),
          Plot.tip(
            data,
            Plot.pointerX({
              x: "date",
              y: "totalEquity",
              title: tipFormat,
            }),
          ),
        ],
      });

      next.setAttribute("aria-label", "Total equity history");
      next.setAttribute("role", "img");
      next.setAttribute(
        "data-testid",
        PORTFOLIO_DETAIL_TEST_IDS.equityChartSvg,
      );
      next.classList.add("h-48", "w-full");

      if (chart) {
        chart.remove();
      }
      container.appendChild(next);
      chart = next;
    };

    render();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => render())
        : null;
    observer?.observe(container);

    return () => {
      observer?.disconnect();
      chart?.remove();
    };
  }, [data]);

  const startRow = series[0]!;
  const endRow = series[series.length - 1]!;

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="w-full" />
      <div className="flex justify-between text-xs text-olive-11 tabular-nums">
        <span>
          {formatIsoDateForDisplay(startRow.date)} ·{" "}
          {formatCurrency(startRow.totalEquity)}
        </span>
        <span>
          {formatIsoDateForDisplay(endRow.date)} ·{" "}
          {formatCurrency(endRow.totalEquity)}
        </span>
      </div>
    </div>
  );
}

function RecentTradesSection({
  portfolioId,
}: {
  portfolioId: Id<"portfolios">;
}) {
  const recentTrades = useQuery(api.portfolios.getRecentTrades, {
    limit: RECENT_TRADES_LIMIT,
    portfolioId,
  });

  return (
    <section
      className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
      data-testid={PORTFOLIO_DETAIL_TEST_IDS.recentTradesSection}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-olive-12">Recent trades</h2>
      </div>

      {recentTrades === undefined ? (
        <div
          aria-busy="true"
          aria-label="Loading recent trades"
          className="overflow-hidden rounded-md border border-slate-6 bg-slate-2"
        >
          <table className="w-full">
            <tbody>
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-slate-6/60 last:border-b-0"
                >
                  {Array.from({ length: 6 }).map((_, colIndex) => (
                    <td key={colIndex} className="px-3 py-3">
                      <Skeleton
                        surface="dense"
                        height="sm"
                        className="w-full"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : recentTrades === null || recentTrades.length === 0 ? (
        <p
          className="text-sm text-olive-11"
          data-testid={PORTFOLIO_DETAIL_TEST_IDS.recentTradesEmpty}
        >
          No trades in this portfolio yet. Trades appear here once they are
          recorded against this portfolio.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-6 bg-slate-2">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-6 text-left text-slate-11">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Ticker</th>
                <th className="px-3 py-2 font-medium">Side</th>
                <th className="px-3 py-2 font-medium">Direction</th>
                <th className="px-3 py-2 text-right font-medium">Quantity</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((trade) => (
                <tr
                  className="border-b border-slate-6/60 last:border-b-0"
                  data-testid={getPortfolioRecentTradeRowTestId(trade._id)}
                  key={trade._id}
                >
                  <td className="px-3 py-2 text-slate-11">
                    {formatDate(trade.date)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-12">
                    {trade.ticker}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={trade.side === "buy" ? "success" : "danger"}
                    >
                      {capitalize(trade.side)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        trade.direction === "long" ? "success" : "danger"
                      }
                    >
                      {capitalize(trade.direction)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-11">
                    {trade.quantity}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-11">
                    {formatCurrency(trade.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
