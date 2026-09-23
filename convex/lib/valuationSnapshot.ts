import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v } from "convex/values";

/**
 * One trustworthy portfolio valuation reference for planning.
 *
 * Two bases are reported side by side and never blended:
 * - `brokerReported`: the latest successful IBKR statement's cash and
 *   position market values. Positions the statement did not price are listed
 *   as missing marks instead of being silently valued at zero.
 * - `reconstructed`: the app's own daily valuation from accepted trades, the
 *   cash ledger, and cached closes, aggregated across portfolios, with the
 *   symbols it could not price listed explicitly.
 */

const MAX_SNAPSHOT_ROWS = 1_000;
const MAX_PORTFOLIOS = 100;

const completenessValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("missing"),
);

export const valuationSnapshotValidator = v.object({
  brokerReported: v.union(
    v.null(),
    v.object({
      accounts: v.array(v.string()),
      asOfDate: v.string(),
      basis: v.literal("broker_reported"),
      cash: v.number(),
      completeness: completenessValidator,
      currency: v.union(v.string(), v.null()),
      equity: v.number(),
      marketValue: v.number(),
      missingCash: v.boolean(),
      missingMarks: v.array(v.string()),
      pricedPositions: v.number(),
      totalPositions: v.number(),
      unsupportedCurrencyMarks: v.array(v.string()),
      valuationTimestamp: v.union(v.number(), v.null()),
    }),
  ),
  freshness: v.object({
    ageDays: v.union(v.number(), v.null()),
    latestAttemptStatus: v.union(v.string(), v.null()),
    latestSuccessfulStatementDate: v.union(v.string(), v.null()),
    status: v.union(
      v.literal("current"),
      v.literal("stale"),
      v.literal("unavailable"),
    ),
  }),
  reconstructed: v.union(
    v.null(),
    v.object({
      asOfDate: v.string(),
      basis: v.literal("reconstructed"),
      cash: v.number(),
      completeness: completenessValidator,
      currency: v.literal("USD"),
      equity: v.number(),
      marketValue: v.number(),
      missingMarks: v.array(v.string()),
      missingPortfolios: v.array(v.string()),
      portfolios: v.array(
        v.object({
          asOfDate: v.string(),
          cash: v.number(),
          completeness: completenessValidator,
          equity: v.number(),
          marketValue: v.number(),
          missingMarks: v.array(v.string()),
          portfolioId: v.id("portfolios"),
          portfolioName: v.string(),
        }),
      ),
      staleDates: v.array(
        v.object({ asOfDate: v.string(), portfolioName: v.string() }),
      ),
      valuationTimestamp: v.number(),
    }),
  ),
});

export type ValuationSnapshot = {
  brokerReported: {
    accounts: string[];
    asOfDate: string;
    basis: "broker_reported";
    cash: number;
    completeness: "complete" | "partial" | "missing";
    currency: string | null;
    equity: number;
    marketValue: number;
    missingCash: boolean;
    missingMarks: string[];
    pricedPositions: number;
    totalPositions: number;
    unsupportedCurrencyMarks: string[];
    valuationTimestamp: number | null;
  } | null;
  freshness: {
    ageDays: number | null;
    latestAttemptStatus: string | null;
    latestSuccessfulStatementDate: string | null;
    status: "current" | "stale" | "unavailable";
  };
  reconstructed: {
    asOfDate: string;
    basis: "reconstructed";
    cash: number;
    completeness: "complete" | "partial" | "missing";
    currency: "USD";
    equity: number;
    marketValue: number;
    missingMarks: string[];
    missingPortfolios: string[];
    portfolios: Array<{
      asOfDate: string;
      cash: number;
      completeness: "complete" | "partial" | "missing";
      equity: number;
      marketValue: number;
      missingMarks: string[];
      portfolioId: Doc<"portfolios">["_id"];
      portfolioName: string;
    }>;
    staleDates: Array<{ asOfDate: string; portfolioName: string }>;
    valuationTimestamp: number;
  } | null;
};

const STALE_AFTER_CALENDAR_DAYS = 4;

function calendarDaysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

async function takeBounded<T>(
  query: { take(n: number): Promise<T[]> },
  limit: number,
  label: string,
): Promise<T[]> {
  const rows = await query.take(limit + 1);
  if (rows.length > limit) {
    throw new Error(`${label} exceeds the ${limit}-row limit`);
  }
  return rows;
}

export async function buildValuationSnapshot(
  ctx: QueryCtx | MutationCtx,
  args: { ownerId: string; todayDate: string },
): Promise<ValuationSnapshot> {
  const [latestAttempt, latestSuccess, portfolios] = await Promise.all([
    ctx.db
      .query("brokerageSyncRuns")
      .withIndex("by_ownerId_and_reportType_and_startedAt", (q) =>
        q.eq("ownerId", args.ownerId).eq("reportType", "activity"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("brokerageSyncRuns")
      .withIndex("by_ownerId_and_reportType_and_status_and_updatedAt", (q) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("reportType", "activity")
          .eq("status", "succeeded"),
      )
      .order("desc")
      .first(),
    takeBounded(
      ctx.db
        .query("portfolios")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)),
      MAX_PORTFOLIOS,
      "Portfolio count",
    ),
  ]);

  let brokerReported: ValuationSnapshot["brokerReported"] = null;
  if (latestSuccess) {
    const [positionRows, cashRows] = await Promise.all([
      takeBounded(
        ctx.db
          .query("brokeragePositionSnapshots")
          .withIndex("by_syncRunId", (q) => q.eq("syncRunId", latestSuccess._id)),
        MAX_SNAPSHOT_ROWS,
        "Broker position snapshot",
      ),
      takeBounded(
        ctx.db
          .query("brokerageCashSnapshots")
          .withIndex("by_syncRunId", (q) => q.eq("syncRunId", latestSuccess._id)),
        MAX_SNAPSHOT_ROWS,
        "Broker cash snapshot",
      ),
    ]);
    // The Flex parser labels the account's base-currency total rows
    // "BASE_SUMMARY", so the base currency itself comes from the per-currency
    // rows: it is known only when the account holds a single currency.
    const baseCashRows = cashRows.filter((row) => row.rowKind === "base_summary");
    const currencyRows = cashRows.filter((row) => row.rowKind === "currency");
    const currencies = [
      ...new Set(currencyRows.map((row) => row.currency.toUpperCase())),
    ];
    const baseCurrency = currencies.length === 1 ? currencies[0]! : null;
    const cash = baseCashRows.reduce((total, row) => total + row.cash, 0);
    const missingCash = baseCashRows.length === 0;
    const missingMarks: string[] = [];
    const unsupportedCurrencyMarks: string[] = [];
    let marketValue = 0;
    let pricedPositions = 0;
    for (const row of positionRows) {
      const ticker = row.ticker.toUpperCase();
      if (row.marketValue === undefined) {
        missingMarks.push(ticker);
        continue;
      }
      const rowCurrency = row.currency?.toUpperCase();
      if (
        rowCurrency !== undefined &&
        baseCurrency !== null &&
        rowCurrency !== baseCurrency
      ) {
        unsupportedCurrencyMarks.push(ticker);
        continue;
      }
      marketValue += row.marketValue;
      pricedPositions += 1;
    }
    const complete =
      !missingCash &&
      missingMarks.length === 0 &&
      unsupportedCurrencyMarks.length === 0;
    brokerReported = {
      accounts: [...new Set(positionRows.map((row) => row.brokerageAccountId))]
        .concat(baseCashRows.map((row) => row.brokerageAccountId))
        .filter((account, index, all) => all.indexOf(account) === index)
        .sort((a, b) => a.localeCompare(b)),
      asOfDate: latestSuccess.reportDate,
      basis: "broker_reported",
      cash,
      completeness: complete
        ? "complete"
        : pricedPositions === 0 && missingCash
          ? "missing"
          : "partial",
      currency: baseCurrency,
      equity: cash + marketValue,
      marketValue,
      missingCash,
      missingMarks: [...new Set(missingMarks)].sort((a, b) => a.localeCompare(b)),
      pricedPositions,
      totalPositions: positionRows.length,
      unsupportedCurrencyMarks: [...new Set(unsupportedCurrencyMarks)].sort(
        (a, b) => a.localeCompare(b),
      ),
      valuationTimestamp: latestSuccess.completedAt ?? null,
    };
  }

  const portfolioValuations: NonNullable<
    ValuationSnapshot["reconstructed"]
  >["portfolios"] = [];
  let latestComputedAt = 0;
  const missingPortfolios: string[] = [];
  for (const portfolio of portfolios) {
    const latest = await ctx.db
      .query("portfolioDailyValuations")
      .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
        q.eq("ownerId", args.ownerId).eq("portfolioId", portfolio._id),
      )
      .order("desc")
      .first();
    if (!latest) {
      missingPortfolios.push(portfolio.name);
      continue;
    }
    latestComputedAt = Math.max(latestComputedAt, latest.computedAt);
    portfolioValuations.push({
      asOfDate: latest.date,
      cash: latest.cashBalance,
      completeness: latest.priceCoverageStatus,
      equity: latest.totalEquity,
      marketValue: latest.marketValue,
      missingMarks: latest.missingSymbols,
      portfolioId: portfolio._id,
      portfolioName: portfolio.name,
    });
  }

  let reconstructed: ValuationSnapshot["reconstructed"] = null;
  if (portfolioValuations.length > 0) {
    const sortedDates = portfolioValuations.map((row) => row.asOfDate).sort();
    const newestDate = sortedDates[sortedDates.length - 1]!;
    const missingMarks = [
      ...new Set(portfolioValuations.flatMap((row) => row.missingMarks)),
    ].sort((a, b) => a.localeCompare(b));
    const allComplete =
      missingPortfolios.length === 0 &&
      portfolioValuations.every((row) => row.completeness === "complete");
    const allMissing = portfolioValuations.every(
      (row) => row.completeness === "missing",
    );
    reconstructed = {
      asOfDate: newestDate,
      basis: "reconstructed",
      cash: portfolioValuations.reduce((total, row) => total + row.cash, 0),
      completeness: allComplete ? "complete" : allMissing ? "missing" : "partial",
      currency: "USD",
      equity: portfolioValuations.reduce((total, row) => total + row.equity, 0),
      marketValue: portfolioValuations.reduce(
        (total, row) => total + row.marketValue,
        0,
      ),
      missingMarks,
      missingPortfolios: missingPortfolios.sort((a, b) => a.localeCompare(b)),
      portfolios: portfolioValuations,
      staleDates: portfolioValuations
        .filter((row) => row.asOfDate !== newestDate)
        .map((row) => ({ asOfDate: row.asOfDate, portfolioName: row.portfolioName })),
      valuationTimestamp: latestComputedAt,
    };
  }

  const referenceDate = brokerReported?.asOfDate ?? reconstructed?.asOfDate ?? null;
  const ageDays =
    referenceDate === null
      ? null
      : calendarDaysBetween(referenceDate, args.todayDate);
  return {
    brokerReported,
    freshness: {
      ageDays,
      latestAttemptStatus: latestAttempt?.status ?? null,
      latestSuccessfulStatementDate: latestSuccess?.reportDate ?? null,
      status:
        ageDays === null
          ? "unavailable"
          : ageDays > STALE_AFTER_CALENDAR_DAYS
            ? "stale"
            : "current",
    },
    reconstructed,
  };
}
