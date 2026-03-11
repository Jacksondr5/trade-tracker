import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";
import { tradeValidator } from "./lib/tradeValidator";
import { paginationOptsValidator } from "convex/server";
import { KRAKEN_DEFAULT_ACCOUNT_ID } from "../shared/imports/constants";

function normalizeTicker(ticker: string): string {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) {
    throw new ConvexError("Ticker is required");
  }
  return normalizedTicker;
}

type BrokerageSource = "ibkr" | "kraken";

type ListTradesPageArgs = {
  accountId?: string;
  accountSource?: BrokerageSource;
  endDate?: number;
  paginationOpts: {
    cursor: string | null;
    numItems: number;
  };
  portfolioId?: Id<"portfolios">;
  startDate?: number;
  ticker?: string;
  withoutPortfolio?: boolean;
};

type FilteredTradesCursorState = {
  bufferedIds: Array<Id<"trades">>;
  databaseCursor: string | null;
  didReachEnd: boolean;
  version: 1;
};

const FILTERED_TRADES_CURSOR_VERSION = 1;
const MIN_FILTERED_TRADES_BATCH_SIZE = 50;
const FILTERED_TRADES_BATCH_MULTIPLIER = 3;

function hasAdditionalTradeFilters(args: ListTradesPageArgs): boolean {
  return Boolean(
    args.ticker ||
      args.portfolioId ||
      args.withoutPortfolio ||
      (args.accountSource && args.accountId),
  );
}

function encodeFilteredTradesCursor(
  state: FilteredTradesCursorState,
): string {
  return JSON.stringify(state);
}

function decodeFilteredTradesCursor(
  cursor: string | null,
): FilteredTradesCursorState {
  if (!cursor) {
    return {
      bufferedIds: [],
      databaseCursor: null,
      didReachEnd: false,
      version: FILTERED_TRADES_CURSOR_VERSION,
    };
  }

  try {
    const parsed = JSON.parse(cursor) as Partial<FilteredTradesCursorState>;
    if (
      parsed.version === FILTERED_TRADES_CURSOR_VERSION &&
      Array.isArray(parsed.bufferedIds) &&
      (typeof parsed.databaseCursor === "string" ||
        parsed.databaseCursor === null) &&
      typeof parsed.didReachEnd === "boolean"
    ) {
      return {
        bufferedIds: parsed.bufferedIds,
        databaseCursor: parsed.databaseCursor,
        didReachEnd: parsed.didReachEnd,
        version: FILTERED_TRADES_CURSOR_VERSION,
      };
    }
  } catch {
    // Fall through to compatibility mode for pre-filter cursors.
  }

  return {
    bufferedIds: [],
    databaseCursor: cursor,
    didReachEnd: false,
    version: FILTERED_TRADES_CURSOR_VERSION,
  };
}

function normalizeBrokerageAccountId(
  source: BrokerageSource,
  accountId: string | undefined,
): string | undefined {
  const normalizedAccountId = accountId?.trim() || undefined;
  if (source === "kraken") {
    return normalizedAccountId ?? KRAKEN_DEFAULT_ACCOUNT_ID;
  }
  return normalizedAccountId;
}

function matchesTradeFilters(
  trade: Doc<"trades">,
  args: ListTradesPageArgs,
): boolean {
  if (args.ticker) {
    const normalizedTickerFilter = args.ticker.trim().toUpperCase();
    if (!trade.ticker.toUpperCase().includes(normalizedTickerFilter)) {
      return false;
    }
  }

  if (args.withoutPortfolio && trade.portfolioId !== undefined) {
    return false;
  }

  if (args.portfolioId && trade.portfolioId !== args.portfolioId) {
    return false;
  }

  if (args.accountSource && args.accountId) {
    if (trade.source !== args.accountSource) {
      return false;
    }

    const tradeAccountId = normalizeBrokerageAccountId(
      args.accountSource,
      trade.brokerageAccountId,
    );

    if (tradeAccountId !== normalizeBrokerageAccountId(args.accountSource, args.accountId)) {
      return false;
    }
  }

  return true;
}

function getTradesByDateQuery(
  ctx: QueryCtx,
  ownerId: string,
  args: ListTradesPageArgs,
) {
  const queryByDate = ctx.db.query("trades");

  if (args.startDate !== undefined && args.endDate !== undefined) {
    return queryByDate
      .withIndex("by_owner_date", (q) =>
        q
          .eq("ownerId", ownerId)
          .gte("date", args.startDate!)
          .lte("date", args.endDate!),
      )
      .order("desc");
  }

  if (args.startDate !== undefined) {
    return queryByDate
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", ownerId).gte("date", args.startDate!),
      )
      .order("desc");
  }

  if (args.endDate !== undefined) {
    return queryByDate
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", ownerId).lte("date", args.endDate!),
      )
      .order("desc");
  }

  return queryByDate
    .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
    .order("desc");
}

async function listFilteredTradesPage(
  ctx: QueryCtx,
  ownerId: string,
  args: ListTradesPageArgs,
) {
  const cursorState = decodeFilteredTradesCursor(args.paginationOpts.cursor);
  const page: Array<Doc<"trades">> = [];
  let bufferedIds = [...cursorState.bufferedIds];
  let databaseCursor = cursorState.databaseCursor;
  let didReachEnd = cursorState.didReachEnd;

  while (page.length < args.paginationOpts.numItems) {
    while (bufferedIds.length > 0 && page.length < args.paginationOpts.numItems) {
      const nextTradeId = bufferedIds.shift();
      if (!nextTradeId) {
        break;
      }

      const trade = await ctx.db.get(nextTradeId);
      if (trade && trade.ownerId === ownerId && matchesTradeFilters(trade, args)) {
        page.push(trade);
      }
    }

    if (page.length >= args.paginationOpts.numItems || didReachEnd) {
      break;
    }

    const nextBatch = await getTradesByDateQuery(ctx, ownerId, args).paginate({
      cursor: databaseCursor,
      numItems: Math.max(
        args.paginationOpts.numItems * FILTERED_TRADES_BATCH_MULTIPLIER,
        MIN_FILTERED_TRADES_BATCH_SIZE,
      ),
    });
    const filteredBatch = nextBatch.page.filter((trade) =>
      matchesTradeFilters(trade, args),
    );
    const remainingSlots = args.paginationOpts.numItems - page.length;

    page.push(...filteredBatch.slice(0, remainingSlots));
    bufferedIds = filteredBatch.slice(remainingSlots).map((trade) => trade._id);
    databaseCursor = nextBatch.continueCursor;
    didReachEnd = nextBatch.isDone;
  }

  return {
    continueCursor: encodeFilteredTradesCursor({
      bufferedIds,
      databaseCursor,
      didReachEnd,
      version: FILTERED_TRADES_CURSOR_VERSION,
    }),
    isDone: bufferedIds.length === 0 && didReachEnd,
    page,
  };
}


export const createTrade = mutation({
  args: {
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    notes: v.optional(v.string()),
    portfolioId: v.optional(v.id("portfolios")),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    ticker: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.id("trades"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    if (args.tradePlanId) {
      const tradePlan = await ctx.db.get(args.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    if (args.portfolioId) {
      const portfolio = await ctx.db.get(args.portfolioId);
      assertOwner(portfolio, ownerId, "Portfolio not found");
    }

    return await ctx.db.insert("trades", {
      assetType: args.assetType,
      date: args.date,
      direction: args.direction,
      notes: args.notes,
      ownerId,
      portfolioId: args.portfolioId,
      price: args.price,
      quantity: args.quantity,
      side: args.side,
      source: "manual",
      ticker: normalizeTicker(args.ticker),
      tradePlanId: args.tradePlanId,
    });
  },
});

export const updateTrade = mutation({
  args: {
    assetType: v.optional(v.union(v.literal("crypto"), v.literal("stock"))),
    date: v.optional(v.number()),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
    notes: v.optional(v.string()),
    portfolioId: v.optional(v.union(v.id("portfolios"), v.null())),
    price: v.optional(v.number()),
    quantity: v.optional(v.number()),
    side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
    ticker: v.optional(v.string()),
    tradeId: v.id("trades"),
    tradePlanId: v.optional(v.union(v.id("tradePlans"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradeId, ...updates } = args;

    const existingTrade = await ctx.db.get(tradeId);
    assertOwner(existingTrade, ownerId, "Trade not found");

    if (updates.tradePlanId !== undefined && updates.tradePlanId !== null) {
      const tradePlan = await ctx.db.get(updates.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    if (updates.portfolioId !== undefined && updates.portfolioId !== null) {
      const portfolio = await ctx.db.get(updates.portfolioId);
      assertOwner(portfolio, ownerId, "Portfolio not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.assetType !== undefined) patch.assetType = updates.assetType;
    if (updates.date !== undefined) patch.date = updates.date;
    if (updates.direction !== undefined) patch.direction = updates.direction;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.portfolioId !== undefined) {
      patch.portfolioId =
        updates.portfolioId === null ? undefined : updates.portfolioId;
    }
    if (updates.price !== undefined) patch.price = updates.price;
    if (updates.quantity !== undefined) patch.quantity = updates.quantity;
    if (updates.side !== undefined) patch.side = updates.side;
    if (updates.ticker !== undefined)
      patch.ticker = normalizeTicker(updates.ticker);
    if (updates.tradePlanId !== undefined) {
      patch.tradePlanId =
        updates.tradePlanId === null ? undefined : updates.tradePlanId;
    }
    patch.ownerId = ownerId;

    await ctx.db.patch(tradeId, patch);

    return null;
  },
});

export const listTrades = query({
  args: {},
  returns: v.array(tradeValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db
      .query("trades")
      .withIndex("by_owner_date", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

export const listTradesByTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(tradeValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = await ctx.db.get(args.tradePlanId);
    if (!tradePlan || tradePlan.ownerId !== ownerId) {
      return [];
    }

    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner_tradePlanId", (q) =>
        q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
      )
      .collect();

    return trades.sort((a, b) => b.date - a.date);
  },
});

export const listTradesByCampaign = query({
  args: {
    campaignId: v.id("campaigns"),
  },
  returns: v.array(tradeValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.ownerId !== ownerId) {
      return [];
    }

    const tradePlans = await ctx.db
      .query("tradePlans")
      .withIndex("by_owner_campaignId", (q) =>
        q.eq("ownerId", ownerId).eq("campaignId", args.campaignId),
      )
      .collect();

    if (tradePlans.length === 0) {
      return [];
    }

    const tradesByPlan = await Promise.all(
      tradePlans.map((tradePlan) =>
        ctx.db
          .query("trades")
          .withIndex("by_owner_tradePlanId", (q) =>
            q.eq("ownerId", ownerId).eq("tradePlanId", tradePlan._id),
          )
          .collect(),
      ),
    );

    return tradesByPlan.flat().sort((a, b) => b.date - a.date);
  },
});

const paginatedTradesValidator = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  page: v.array(tradeValidator),
  pageStatus: v.optional(v.union(v.string(), v.null())),
  splitCursor: v.optional(v.union(v.string(), v.null())),
});

export const listTradesPage = query({
  args: {
    accountId: v.optional(v.string()),
    accountSource: v.optional(v.union(v.literal("ibkr"), v.literal("kraken"))),
    endDate: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
    portfolioId: v.optional(v.id("portfolios")),
    startDate: v.optional(v.number()),
    ticker: v.optional(v.string()),
    withoutPortfolio: v.optional(v.boolean()),
  },
  returns: paginatedTradesValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradesByDate = getTradesByDateQuery(ctx, ownerId, args);

    if (hasAdditionalTradeFilters(args)) {
      return await listFilteredTradesPage(ctx, ownerId, args);
    }

    return await tradesByDate.paginate(args.paginationOpts);
  },
});
