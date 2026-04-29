import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";

const MARKET_DATA_PROVIDER = "twelve_data";
const POSITION_EPSILON = 0.00000001;
const MAX_SERIES_ROWS = 2_000;

const priceCoverageStatusValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("missing"),
);

const portfolioDailyValuationValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolioDailyValuations"),
  cashBalance: v.number(),
  computedAt: v.number(),
  date: v.string(),
  marketValue: v.number(),
  missingSymbols: v.array(v.string()),
  ownerId: v.string(),
  portfolioId: v.id("portfolios"),
  priceCoverageStatus: priceCoverageStatusValidator,
  totalEquity: v.number(),
});

type PositionKey = `${"crypto" | "stock"}:${string}:${"long" | "short"}`;

type Position = {
  assetType: "crypto" | "stock";
  direction: "long" | "short";
  quantity: number;
  ticker: string;
};

type ComputedValuation = {
  cashBalance: number;
  date: string;
  marketValue: number;
  missingSymbols: string[];
  priceCoverageStatus: "complete" | "missing" | "partial";
  totalEquity: number;
};

function assertIsoDate(value: string, name: "date" | "endDate" | "startDate") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConvexError(`${name} must use YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ConvexError(`${name} must be a valid calendar date`);
  }
}

function endOfUtcDate(date: string): number {
  return Date.parse(`${date}T23:59:59.999Z`);
}

function getTradeCashFlow(trade: Doc<"trades">): number {
  const gross = trade.price * trade.quantity;
  const costs = (trade.fees ?? 0) + (trade.taxes ?? 0);
  return trade.side === "buy" ? -(gross + costs) : gross - costs;
}

function getSignedPositionQuantity(trade: Doc<"trades">): number {
  const openingSide = trade.direction === "long" ? "buy" : "sell";
  return trade.side === openingSide ? trade.quantity : -trade.quantity;
}

function getPositionMarketValue(position: Position, close: number): number {
  const value = position.quantity * close;
  return position.direction === "short" ? -value : value;
}

async function getPortfolioTradesThroughDate(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  portfolioId: Id<"portfolios">,
  date: string,
): Promise<Doc<"trades">[]> {
  const endTimestamp = endOfUtcDate(date);
  const trades: Doc<"trades">[] = [];
  for await (const trade of ctx.db
    .query("trades")
    .withIndex("by_owner_portfolioId_date", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("portfolioId", portfolioId)
        .lte("date", endTimestamp),
    )) {
    trades.push(trade);
  }
  return trades;
}

async function getCashLedgerTotalThroughDate(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  portfolioId: Id<"portfolios">,
  date: string,
): Promise<number> {
  const endTimestamp = endOfUtcDate(date);
  let total = 0;
  for await (const entry of ctx.db
    .query("portfolioCashLedgerEntries")
    .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("portfolioId", portfolioId)
        .lte("date", endTimestamp),
    )) {
    total += entry.amount;
  }
  return total;
}

async function getNetExternalCashFlowInRange(
  ctx: QueryCtx,
  ownerId: string,
  portfolioId: Id<"portfolios">,
  startDate: string,
  endDate: string,
): Promise<number> {
  const startTimestamp = endOfUtcDate(startDate);
  const endTimestamp = endOfUtcDate(endDate);
  let total = 0;
  for await (const entry of ctx.db
    .query("portfolioCashLedgerEntries")
    .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("portfolioId", portfolioId)
        .gt("date", startTimestamp)
        .lte("date", endTimestamp),
    )) {
    total += entry.amount;
  }
  return total;
}

async function getInstrumentForPosition(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  position: Position,
): Promise<Doc<"marketDataInstruments"> | null> {
  return await ctx.db
    .query("marketDataInstruments")
    .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("assetType", position.assetType)
        .eq("symbol", position.ticker),
    )
    .unique();
}

async function getCloseForInstrument(
  ctx: QueryCtx | MutationCtx,
  instrument: Doc<"marketDataInstruments">,
  date: string,
): Promise<number | null> {
  if (
    instrument.resolutionStatus !== "resolved" ||
    !instrument.providerSymbol
  ) {
    return null;
  }
  const snapshot = await ctx.db
    .query("marketPriceSnapshots")
    .withIndex("by_provider_and_providerSymbol_and_date", (q) =>
      q
        .eq("provider", MARKET_DATA_PROVIDER)
        .eq("providerSymbol", instrument.providerSymbol!)
        .eq("date", date),
    )
    .unique();

  return snapshot?.status === "ok" && snapshot.close !== undefined
    ? snapshot.close
    : null;
}

async function computeValuation(
  ctx: MutationCtx,
  ownerId: string,
  portfolioId: Id<"portfolios">,
  date: string,
): Promise<ComputedValuation> {
  const trades = await getPortfolioTradesThroughDate(
    ctx,
    ownerId,
    portfolioId,
    date,
  );
  const ledgerCash = await getCashLedgerTotalThroughDate(
    ctx,
    ownerId,
    portfolioId,
    date,
  );
  const tradeCash = trades.reduce(
    (total, trade) => total + getTradeCashFlow(trade),
    0,
  );
  const cashBalance = ledgerCash + tradeCash;
  const positionsByKey = new Map<PositionKey, Position>();

  for (const trade of trades) {
    const key: PositionKey = `${trade.assetType}:${trade.ticker}:${trade.direction}`;
    const position =
      positionsByKey.get(key) ??
      ({
        assetType: trade.assetType,
        direction: trade.direction,
        quantity: 0,
        ticker: trade.ticker,
      } satisfies Position);
    position.quantity += getSignedPositionQuantity(trade);
    positionsByKey.set(key, position);
  }

  let marketValue = 0;
  let pricedPositions = 0;
  const missingSymbols = new Set<string>();
  const openPositions = [...positionsByKey.values()].filter(
    (position) => Math.abs(position.quantity) > POSITION_EPSILON,
  );

  for (const position of openPositions) {
    const instrument = await getInstrumentForPosition(ctx, ownerId, position);
    const close = instrument
      ? await getCloseForInstrument(ctx, instrument, date)
      : null;
    if (close === null) {
      missingSymbols.add(position.ticker);
      continue;
    }
    marketValue += getPositionMarketValue(position, close);
    pricedPositions += 1;
  }

  const priceCoverageStatus =
    openPositions.length === pricedPositions
      ? "complete"
      : pricedPositions === 0
        ? "missing"
        : "partial";

  return {
    cashBalance,
    date,
    marketValue,
    missingSymbols: [...missingSymbols].sort((a, b) => a.localeCompare(b)),
    priceCoverageStatus,
    totalEquity: cashBalance + marketValue,
  };
}

async function upsertDailyValuation(args: {
  ctx: MutationCtx;
  date: string;
  ownerId: string;
  portfolioId: Id<"portfolios">;
}): Promise<Doc<"portfolioDailyValuations">> {
  const computed = await computeValuation(
    args.ctx,
    args.ownerId,
    args.portfolioId,
    args.date,
  );
  const computedAt = Date.now();
  const existing = await args.ctx.db
    .query("portfolioDailyValuations")
    .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
      q
        .eq("ownerId", args.ownerId)
        .eq("portfolioId", args.portfolioId)
        .eq("date", args.date),
    )
    .unique();
  const row = {
    ...computed,
    computedAt,
    ownerId: args.ownerId,
    portfolioId: args.portfolioId,
  };

  const valuationId =
    existing === null
      ? await args.ctx.db.insert("portfolioDailyValuations", row)
      : existing._id;
  if (existing !== null) {
    await args.ctx.db.replace(existing._id, row);
  }

  const valuation = await args.ctx.db.get(valuationId);
  if (valuation === null) {
    throw new ConvexError("Portfolio valuation not found after compute");
  }
  return valuation;
}

export const computeDailyValuation = mutation({
  args: {
    date: v.string(),
    portfolioId: v.id("portfolios"),
  },
  returns: portfolioDailyValuationValidator,
  handler: async (ctx, args) => {
    assertIsoDate(args.date, "date");
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    assertOwner(portfolio, ownerId, "Portfolio not found");

    return await upsertDailyValuation({
      ctx,
      date: args.date,
      ownerId,
      portfolioId: args.portfolioId,
    });
  },
});

export const computeDailyValuationForOwner = internalMutation({
  args: {
    date: v.string(),
    ownerId: v.string(),
    portfolioId: v.id("portfolios"),
  },
  returns: portfolioDailyValuationValidator,
  handler: async (ctx, args) => {
    assertIsoDate(args.date, "date");
    const portfolio = await ctx.db.get(args.portfolioId);
    assertOwner(portfolio, args.ownerId, "Portfolio not found");

    return await upsertDailyValuation({
      ctx,
      date: args.date,
      ownerId: args.ownerId,
      portfolioId: args.portfolioId,
    });
  },
});

export const computeDailyValuationsForOwner = internalMutation({
  args: {
    date: v.string(),
    ownerId: v.string(),
  },
  returns: v.object({
    date: v.string(),
    ownerId: v.string(),
    portfoliosComputed: v.number(),
  }),
  handler: async (ctx, args) => {
    assertIsoDate(args.date, "date");
    const portfolios = await ctx.db
      .query("portfolios")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();

    for (const portfolio of portfolios) {
      await upsertDailyValuation({
        ctx,
        date: args.date,
        ownerId: args.ownerId,
        portfolioId: portfolio._id,
      });
    }

    return {
      date: args.date,
      ownerId: args.ownerId,
      portfoliosComputed: portfolios.length,
    };
  },
});

export const listEquitySeries = query({
  args: {
    endDate: v.string(),
    portfolioId: v.id("portfolios"),
    startDate: v.string(),
  },
  returns: v.array(portfolioDailyValuationValidator),
  handler: async (ctx, args) => {
    assertIsoDate(args.startDate, "startDate");
    assertIsoDate(args.endDate, "endDate");
    if (args.startDate > args.endDate) {
      throw new ConvexError("startDate must be on or before endDate");
    }

    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio || portfolio.ownerId !== ownerId) {
      return [];
    }

    return await ctx.db
      .query("portfolioDailyValuations")
      .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("portfolioId", args.portfolioId)
          .gte("date", args.startDate)
          .lte("date", args.endDate),
      )
      .order("asc")
      .take(MAX_SERIES_ROWS);
  },
});

export const getTimeframeReturn = query({
  args: {
    endDate: v.string(),
    portfolioId: v.id("portfolios"),
    startDate: v.string(),
  },
  returns: v.object({
    endingEquity: v.number(),
    netExternalCashFlow: v.number(),
    returnPercent: v.union(v.number(), v.null()),
    startingEquity: v.number(),
  }),
  handler: async (ctx, args) => {
    assertIsoDate(args.startDate, "startDate");
    assertIsoDate(args.endDate, "endDate");
    if (args.startDate > args.endDate) {
      throw new ConvexError("startDate must be on or before endDate");
    }

    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    assertOwner(portfolio, ownerId, "Portfolio not found");

    const startingValuation = await ctx.db
      .query("portfolioDailyValuations")
      .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("portfolioId", args.portfolioId)
          .eq("date", args.startDate),
      )
      .unique();
    const endingValuation = await ctx.db
      .query("portfolioDailyValuations")
      .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("portfolioId", args.portfolioId)
          .eq("date", args.endDate),
      )
      .unique();

    if (startingValuation === null || endingValuation === null) {
      throw new ConvexError(
        "Portfolio valuation rows are required for the requested period",
      );
    }

    const netExternalCashFlow = await getNetExternalCashFlowInRange(
      ctx,
      ownerId,
      args.portfolioId,
      args.startDate,
      args.endDate,
    );
    const startingEquity = startingValuation.totalEquity;
    const endingEquity = endingValuation.totalEquity;
    const returnPercent =
      startingEquity === 0
        ? null
        : (endingEquity - startingEquity - netExternalCashFlow) /
          startingEquity;

    return {
      endingEquity,
      netExternalCashFlow,
      returnPercent,
      startingEquity,
    };
  },
});
