import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { assertOwner, requireUser } from "./lib/auth";
import { ensureMarketDataInstrumentReviewRecord } from "./lib/marketDataInstruments";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { resolveInstrumentForOwner } from "./marketData";
import { validateInboxTradeCandidate } from "../shared/imports/validation";
import { KRAKEN_DEFAULT_ACCOUNT_ID } from "../shared/imports/constants";
import {
  findAutoMatchTradePlanId,
  findMatchingTradePlans,
} from "../shared/imports/auto-match";

type CanonicalCandidate = {
  assetType: "stock" | "crypto";
  date: number;
  direction: "long" | "short";
  price: number;
  quantity: number;
  side: "buy" | "sell";
  ticker: string;
};

type PriceMappingState =
  | { state: "missing" }
  | {
      state: "needs_review";
      instrumentId: Id<"marketDataInstruments">;
      lastError?: string;
    }
  | {
      state: "resolved";
      instrumentId: Id<"marketDataInstruments">;
      providerSymbol: string;
    }
  | { state: "ignored"; instrumentId: Id<"marketDataInstruments"> };

const sourceValidator = v.union(
  v.literal("ibkr"),
  v.literal("kraken"),
  v.literal("manual"),
);

const inboxTradeValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("inboxTrades"),
  assetType: v.optional(v.union(v.literal("crypto"), v.literal("stock"))),
  brokerageAccountId: v.optional(v.string()),
  date: v.optional(v.number()),
  direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  portfolioId: v.optional(v.id("portfolios")),
  price: v.optional(v.number()),
  quantity: v.optional(v.number()),
  side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
  source: sourceValidator,
  status: v.union(v.literal("pending_review")),
  taxes: v.optional(v.number()),
  ticker: v.optional(v.string()),
  tradePlanId: v.optional(v.id("tradePlans")),
  validationErrors: v.array(v.string()),
  validationWarnings: v.array(v.string()),
});

const openTradePlanReferenceValidator = v.object({
  _id: v.id("tradePlans"),
  campaignId: v.optional(v.id("campaigns")),
  instrumentSymbol: v.string(),
  name: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("idea"),
    v.literal("watching"),
  ),
});

const assignedTradePlanReferenceValidator = v.object({
  _id: v.id("tradePlans"),
  campaignId: v.optional(v.id("campaigns")),
  instrumentSymbol: v.string(),
  name: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("idea"),
    v.literal("watching"),
  ),
});

const priceMappingStateValidator = v.union(
  v.object({
    state: v.literal("missing"),
  }),
  v.object({
    state: v.literal("needs_review"),
    instrumentId: v.id("marketDataInstruments"),
    lastError: v.optional(v.string()),
  }),
  v.object({
    state: v.literal("resolved"),
    instrumentId: v.id("marketDataInstruments"),
    providerSymbol: v.string(),
  }),
  v.object({
    state: v.literal("ignored"),
    instrumentId: v.id("marketDataInstruments"),
  }),
);

const importReviewRowValidator = v.object({
  inboxTrade: inboxTradeValidator,
  matchContext: v.object({
    assignedTradePlan: v.union(assignedTradePlanReferenceValidator, v.null()),
    candidateCount: v.number(),
    suggestedTradePlans: v.array(openTradePlanReferenceValidator),
    ticker: v.union(v.string(), v.null()),
  }),
  matchState: v.union(
    v.literal("ambiguous"),
    v.literal("assigned"),
    v.literal("suggested"),
    v.literal("unmatched"),
  ),
  priceMapping: priceMappingStateValidator,
  readiness: v.object({
    isReady: v.boolean(),
    missingFields: v.array(v.string()),
  }),
  reviewState: v.union(v.literal("needs_review"), v.literal("ready")),
  validationState: v.union(
    v.literal("error"),
    v.literal("valid"),
    v.literal("warning"),
  ),
});

const campaignReferenceValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("campaigns"),
  name: v.string(),
  ownerId: v.string(),
  status: v.union(v.literal("active"), v.literal("planning")),
  thesis: v.string(),
});

const accountMappingValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("accountMappings"),
  accountId: v.string(),
  friendlyName: v.string(),
  ownerId: v.string(),
  source: sourceValidator,
});

const portfolioReferenceValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolios"),
  name: v.string(),
  ownerId: v.string(),
  tradeCount: v.number(),
});

const importsReviewWorkspaceValidator = v.object({
  referenceData: v.object({
    accountMappings: v.array(accountMappingValidator),
    campaigns: v.array(campaignReferenceValidator),
    openTradePlans: v.array(openTradePlanReferenceValidator),
    portfolios: v.array(portfolioReferenceValidator),
  }),
  rows: v.array(importReviewRowValidator),
  summary: v.object({
    ambiguousCount: v.number(),
    assignedCount: v.number(),
    errorCount: v.number(),
    needsReviewCount: v.number(),
    readyCount: v.number(),
    suggestedCount: v.number(),
    totalPendingCount: v.number(),
    unmatchedCount: v.number(),
    validCount: v.number(),
    warningCount: v.number(),
  }),
});

type ImportSource = "ibkr" | "kraken" | "manual";

function dedupKey(source: ImportSource, externalId: string): string {
  return `${source}|${externalId}`;
}

function normalizeBrokerageAccountId(
  source: ImportSource,
  accountId: string | undefined,
): string | undefined {
  const normalizedAccountId = accountId?.trim() || undefined;
  if (source === "kraken") {
    return normalizedAccountId ?? KRAKEN_DEFAULT_ACCOUNT_ID;
  }
  return normalizedAccountId;
}

function sortOpenTradePlansForImports<
  T extends { _creationTime: number; instrumentSymbol: string; name: string },
>(plans: T[]): T[] {
  return [...plans].sort(
    (a, b) =>
      a.instrumentSymbol.localeCompare(b.instrumentSymbol) ||
      a.name.localeCompare(b.name) ||
      b._creationTime - a._creationTime,
  );
}

function getInboxTradeReadiness(trade: {
  assetType?: "crypto" | "stock";
  date?: number;
  direction?: "long" | "short";
  price?: number;
  quantity?: number;
  side?: "buy" | "sell";
  ticker?: string;
}) {
  const missingFields: string[] = [];

  if (!trade.ticker) missingFields.push("ticker");
  if (!trade.assetType) missingFields.push("assetType");
  if (!trade.side) missingFields.push("side");
  if (!trade.direction) missingFields.push("direction");
  if (trade.date === undefined || !Number.isFinite(trade.date)) {
    missingFields.push("date");
  }
  if (
    trade.price === undefined ||
    !Number.isFinite(trade.price) ||
    trade.price <= 0
  ) {
    missingFields.push("price");
  }
  if (
    trade.quantity === undefined ||
    !Number.isFinite(trade.quantity) ||
    trade.quantity <= 0
  ) {
    missingFields.push("quantity");
  }

  return {
    isReady: missingFields.length === 0,
    missingFields,
  };
}

type InboxAcceptanceCheck =
  | {
      ok: true;
      assetType: "crypto" | "stock";
      candidate: CanonicalCandidate;
      inboxTrade: Doc<"inboxTrades">;
      portfolioId: Id<"portfolios"> | undefined;
      tradePlanId: Id<"tradePlans"> | undefined;
    }
  | { ok: false; error: string };

async function checkInboxTradeForAcceptance(
  ctx: MutationCtx,
  ownerId: string,
  inboxTradeId: Id<"inboxTrades">,
  args: {
    portfolioId?: Id<"portfolios">;
    tradePlanId?: Id<"tradePlans">;
  },
): Promise<InboxAcceptanceCheck> {
  const rawInboxTrade = await ctx.db.get(inboxTradeId);
  const inboxTrade = assertOwner(
    rawInboxTrade,
    ownerId,
    "Inbox trade not found",
  );

  if (inboxTrade.status !== "pending_review") {
    return { ok: false, error: "Trade is not pending review" };
  }

  const tradePlanId =
    args.tradePlanId !== undefined ? args.tradePlanId : inboxTrade.tradePlanId;
  const portfolioId =
    args.portfolioId !== undefined ? args.portfolioId : inboxTrade.portfolioId;

  if (tradePlanId !== undefined) {
    const tradePlan = await ctx.db.get(tradePlanId);
    assertOwner(tradePlan, ownerId, "Trade plan not found");
  }

  if (portfolioId !== undefined) {
    const portfolio = await ctx.db.get(portfolioId);
    assertOwner(portfolio, ownerId, "Portfolio not found");
  }

  const validation = validateInboxTradeCandidate(inboxTrade, {
    includeExisting: false,
  });
  if (validation.validationErrors.length > 0) {
    await ctx.db.patch(inboxTrade._id, {
      validationErrors: validation.validationErrors,
      validationWarnings: validation.validationWarnings,
    });
    return { ok: false, error: validation.validationErrors.join("; ") };
  }

  const candidate: CanonicalCandidate = {
    assetType: inboxTrade.assetType!,
    date: inboxTrade.date!,
    direction: inboxTrade.direction!,
    price: inboxTrade.price!,
    quantity: inboxTrade.quantity!,
    side: inboxTrade.side!,
    ticker: validation.normalizedTicker!,
  };

  return {
    ok: true,
    assetType: candidate.assetType,
    candidate,
    inboxTrade,
    portfolioId,
    tradePlanId,
  };
}

async function commitInboxTradeAcceptance(
  ctx: MutationCtx,
  ownerId: string,
  args: {
    candidate: CanonicalCandidate;
    inboxTrade: Doc<"inboxTrades">;
    instrumentId: Id<"marketDataInstruments">;
    portfolioId: Id<"portfolios"> | undefined;
    tradePlanId: Id<"tradePlans"> | undefined;
  },
): Promise<{ accepted: boolean; error?: string }> {
  const instrument = assertOwner(
    await ctx.db.get(args.instrumentId),
    ownerId,
    "Market data instrument not found",
  );
  if (
    instrument.resolutionStatus !== "resolved" &&
    instrument.resolutionStatus !== "ignored"
  ) {
    return {
      accepted: false,
      error: `Price mapping required for ${args.candidate.ticker}: ${instrument.lastError ?? "instrument not resolved"}`,
    };
  }
  if (
    instrument.assetType !== args.candidate.assetType ||
    instrument.symbol !== args.candidate.ticker
  ) {
    return {
      accepted: false,
      error: "Market data instrument does not match trade",
    };
  }

  await ctx.db.insert("trades", {
    assetType: args.candidate.assetType,
    brokerageAccountId: normalizeBrokerageAccountId(
      args.inboxTrade.source,
      args.inboxTrade.brokerageAccountId,
    ),
    date: args.candidate.date,
    direction: args.candidate.direction,
    externalId: args.inboxTrade.externalId,
    fees: args.inboxTrade.fees,
    orderType: args.inboxTrade.orderType,
    ownerId,
    portfolioId: args.portfolioId,
    price: args.candidate.price,
    quantity: args.candidate.quantity,
    side: args.candidate.side,
    source: args.inboxTrade.source,
    taxes: args.inboxTrade.taxes,
    ticker: args.candidate.ticker,
    tradePlanId: args.tradePlanId,
  });

  await ctx.db.delete(args.inboxTrade._id);

  return { accepted: true };
}

export const importTrades = mutation({
  args: {
    trades: v.array(
      v.object({
        assetType: v.optional(v.union(v.literal("stock"), v.literal("crypto"))),
        brokerageAccountId: v.optional(v.string()),
        date: v.optional(v.number()),
        direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
        externalId: v.optional(v.string()),
        fees: v.optional(v.number()),
        orderType: v.optional(v.string()),
        portfolioId: v.optional(v.id("portfolios")),
        price: v.optional(v.number()),
        quantity: v.optional(v.number()),
        side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
        source: sourceValidator,
        taxes: v.optional(v.number()),
        ticker: v.optional(v.string()),
        tradePlanId: v.optional(v.id("tradePlans")),
        validationErrors: v.optional(v.array(v.string())),
        validationWarnings: v.optional(v.array(v.string())),
      }),
    ),
  },
  returns: v.object({
    imported: v.number(),
    skippedDuplicates: v.number(),
    withValidationErrors: v.number(),
    withWarnings: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    const existingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const existingPendingInboxTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect();

    const existingExternalIds = new Set<string>([
      ...existingTrades
        .filter(
          (
            t,
          ): t is typeof t & {
            externalId: string;
            source: ImportSource;
          } =>
            t.externalId !== undefined &&
            (t.source === "ibkr" ||
              t.source === "kraken" ||
              t.source === "manual"),
        )
        .map((t) => dedupKey(t.source, t.externalId)),
      ...existingPendingInboxTrades
        .filter(
          (t): t is typeof t & { externalId: string } =>
            t.externalId !== undefined,
        )
        .map((t) => dedupKey(t.source, t.externalId)),
    ]);

    const [activeTradePlans, ideaTradePlans, watchingTradePlans] =
      await Promise.all([
        ctx.db
          .query("tradePlans")
          .withIndex("by_owner_status", (q) =>
            q.eq("ownerId", ownerId).eq("status", "active"),
          )
          .collect(),
        ctx.db
          .query("tradePlans")
          .withIndex("by_owner_status", (q) =>
            q.eq("ownerId", ownerId).eq("status", "idea"),
          )
          .collect(),
        ctx.db
          .query("tradePlans")
          .withIndex("by_owner_status", (q) =>
            q.eq("ownerId", ownerId).eq("status", "watching"),
          )
          .collect(),
      ]);
    const openTradePlans = [
      ...activeTradePlans,
      ...ideaTradePlans,
      ...watchingTradePlans,
    ];

    const tradePlanMatchList = openTradePlans.map((p) => ({
      id: p._id as string,
      instrumentSymbol: p.instrumentSymbol,
    }));

    let imported = 0;
    let skippedDuplicates = 0;
    let withValidationErrors = 0;
    let withWarnings = 0;
    const scheduledResolutionKeys = new Set<string>();

    const portfolioOwnerCache = new Map<Id<"portfolios">, true>();
    const tradePlanOwnerCache = new Map<Id<"tradePlans">, true>();

    for (const trade of args.trades) {
      const brokerageAccountId = normalizeBrokerageAccountId(
        trade.source,
        trade.brokerageAccountId,
      );

      if (trade.externalId) {
        const key = dedupKey(trade.source, trade.externalId);
        if (existingExternalIds.has(key)) {
          skippedDuplicates++;
          continue;
        }
        existingExternalIds.add(key);
      }

      const validation = validateInboxTradeCandidate(trade, {
        includeExisting: false,
      });
      const validationErrors = validation.validationErrors;
      const validationWarnings = validation.validationWarnings;

      if (validationErrors.length > 0) withValidationErrors++;
      if (validationWarnings.length > 0) withWarnings++;

      if (trade.tradePlanId !== undefined) {
        if (!tradePlanOwnerCache.has(trade.tradePlanId)) {
          const tradePlan = await ctx.db.get(trade.tradePlanId);
          assertOwner(tradePlan, ownerId, "Trade plan not found");
          tradePlanOwnerCache.set(trade.tradePlanId, true);
        }
      }

      let resolvedTradePlanId = trade.tradePlanId;
      if (resolvedTradePlanId === undefined && validation.normalizedTicker) {
        const autoMatchId = findAutoMatchTradePlanId(
          validation.normalizedTicker,
          tradePlanMatchList,
        );
        if (autoMatchId) {
          resolvedTradePlanId = autoMatchId as Id<"tradePlans">;
        }
      }

      if (trade.portfolioId !== undefined) {
        if (!portfolioOwnerCache.has(trade.portfolioId)) {
          const portfolio = await ctx.db.get(trade.portfolioId);
          assertOwner(portfolio, ownerId, "Portfolio not found");
          portfolioOwnerCache.set(trade.portfolioId, true);
        }
      }

      if (trade.assetType && validation.normalizedTicker) {
        const instrument = await ensureMarketDataInstrumentReviewRecord(
          ctx,
          ownerId,
          trade.assetType,
          validation.normalizedTicker,
        );
        if (
          instrument !== null &&
          instrument.resolutionStatus !== "resolved" &&
          instrument.resolutionStatus !== "ignored"
        ) {
          const resolutionKey = `${trade.assetType}|${validation.normalizedTicker}`;
          if (!scheduledResolutionKeys.has(resolutionKey)) {
            scheduledResolutionKeys.add(resolutionKey);
            await ctx.scheduler.runAfter(
              0,
              internal.marketData.resolveInstrumentInternal,
              {
                assetType: trade.assetType,
                ownerId,
                ticker: validation.normalizedTicker,
              },
            );
          }
        }
      }

      await ctx.db.insert("inboxTrades", {
        assetType: trade.assetType,
        brokerageAccountId,
        date: trade.date,
        direction: trade.direction,
        externalId: trade.externalId,
        fees: trade.fees,
        orderType: trade.orderType,
        ownerId,
        portfolioId: trade.portfolioId,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        source: trade.source,
        status: "pending_review",
        taxes: trade.taxes,
        ticker: validation.normalizedTicker,
        tradePlanId: resolvedTradePlanId,
        validationErrors,
        validationWarnings,
      });

      imported++;
    }

    return { imported, skippedDuplicates, withValidationErrors, withWarnings };
  },
});

export const listInboxTrades = query({
  args: {},
  returns: v.array(inboxTradeValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const trades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect();

    return trades.sort(
      (a, b) => (b.date ?? b._creationTime) - (a.date ?? a._creationTime),
    );
  },
});

export const listInboxTradePriceMappings = query({
  args: {},
  returns: v.array(
    v.object({
      inboxTradeId: v.id("inboxTrades"),
      priceMapping: priceMappingStateValidator,
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const [trades, ownerInstruments] = await Promise.all([
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "pending_review"),
        )
        .collect(),
      ctx.db
        .query("marketDataInstruments")
        .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
          q.eq("ownerId", ownerId),
        )
        .collect(),
    ]);

    const instrumentByAssetTypeAndSymbol = new Map<
      string,
      Doc<"marketDataInstruments">
    >();
    for (const instrument of ownerInstruments) {
      instrumentByAssetTypeAndSymbol.set(
        `${instrument.assetType}|${instrument.symbol}`,
        instrument,
      );
    }

    return trades.map((trade) => {
      const instrument =
        trade.assetType !== undefined && trade.ticker !== undefined
          ? instrumentByAssetTypeAndSymbol.get(
              `${trade.assetType}|${trade.ticker}`,
            )
          : undefined;
      const priceMapping: PriceMappingState =
        instrument === undefined
          ? { state: "missing" }
          : instrument.resolutionStatus === "resolved"
            ? {
                state: "resolved",
                instrumentId: instrument._id,
                providerSymbol: instrument.providerSymbol ?? "",
              }
            : instrument.resolutionStatus === "ignored"
              ? { state: "ignored", instrumentId: instrument._id }
              : {
                  state: "needs_review",
                  instrumentId: instrument._id,
                  lastError: instrument.lastError,
                };
      return { inboxTradeId: trade._id, priceMapping };
    });
  },
});

export const getImportsReviewWorkspace = query({
  args: {},
  returns: importsReviewWorkspaceValidator,
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const [
      inboxTrades,
      accountMappings,
      portfolios,
      activeCampaigns,
      planningCampaigns,
      activeTradePlans,
      ideaTradePlans,
      watchingTradePlans,
      allTradePlans,
      ownerTrades,
      ownerInstruments,
    ] = await Promise.all([
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "pending_review"),
        )
        .collect(),
      ctx.db
        .query("accountMappings")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("portfolios")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .order("desc")
        .collect(),
      ctx.db
        .query("campaigns")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "active"),
        )
        .order("desc")
        .collect(),
      ctx.db
        .query("campaigns")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "planning"),
        )
        .order("desc")
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "idea"),
        )
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "watching"),
        )
        .collect(),
      ctx.db
        .query("tradePlans")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("marketDataInstruments")
        .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
          q.eq("ownerId", ownerId),
        )
        .collect(),
    ]);

    const campaignReferences = [
      ...activeCampaigns.map((campaign) => ({
        _creationTime: campaign._creationTime,
        _id: campaign._id,
        name: campaign.name,
        ownerId: campaign.ownerId,
        status: "active" as const,
        thesis: campaign.thesis,
      })),
      ...planningCampaigns.map((campaign) => ({
        _creationTime: campaign._creationTime,
        _id: campaign._id,
        name: campaign.name,
        ownerId: campaign.ownerId,
        status: "planning" as const,
        thesis: campaign.thesis,
      })),
    ].sort((a, b) => b._creationTime - a._creationTime);
    const openTradePlanReferences = sortOpenTradePlansForImports([
      ...activeTradePlans.map((plan) => ({
        _creationTime: plan._creationTime,
        _id: plan._id,
        campaignId: plan.campaignId,
        instrumentSymbol: plan.instrumentSymbol,
        name: plan.name,
        status: "active" as const,
      })),
      ...ideaTradePlans.map((plan) => ({
        _creationTime: plan._creationTime,
        _id: plan._id,
        campaignId: plan.campaignId,
        instrumentSymbol: plan.instrumentSymbol,
        name: plan.name,
        status: "idea" as const,
      })),
      ...watchingTradePlans.map((plan) => ({
        _creationTime: plan._creationTime,
        _id: plan._id,
        campaignId: plan.campaignId,
        instrumentSymbol: plan.instrumentSymbol,
        name: plan.name,
        status: "watching" as const,
      })),
    ]).map((plan) => ({
      _id: plan._id,
      campaignId: plan.campaignId,
      instrumentSymbol: plan.instrumentSymbol,
      name: plan.name,
      status: plan.status,
    }));
    const openTradePlanMatchList = openTradePlanReferences.map((plan) => ({
      id: plan._id as string,
      instrumentSymbol: plan.instrumentSymbol,
    }));
    const openTradePlanReferenceById = new Map(
      openTradePlanReferences.map((plan) => [plan._id, plan]),
    );
    const assignedTradePlanById = new Map(
      allTradePlans.map((plan) => [
        plan._id,
        {
          _id: plan._id,
          campaignId: plan.campaignId,
          instrumentSymbol: plan.instrumentSymbol,
          name: plan.name,
          status: plan.status,
        },
      ]),
    );

    const tradeCountByPortfolioId = new Map<Id<"portfolios">, number>();
    for (const trade of ownerTrades) {
      if (!trade.portfolioId) continue;
      tradeCountByPortfolioId.set(
        trade.portfolioId,
        (tradeCountByPortfolioId.get(trade.portfolioId) ?? 0) + 1,
      );
    }

    const instrumentByAssetTypeAndSymbol = new Map<
      string,
      Doc<"marketDataInstruments">
    >();
    for (const instrument of ownerInstruments) {
      instrumentByAssetTypeAndSymbol.set(
        `${instrument.assetType}|${instrument.symbol}`,
        instrument,
      );
    }

    const rows = [...inboxTrades]
      .sort((a, b) => (b.date ?? b._creationTime) - (a.date ?? a._creationTime))
      .map((trade) => {
        const readiness = getInboxTradeReadiness(trade);
        const validationState: "error" | "valid" | "warning" =
          trade.validationErrors.length > 0
            ? "error"
            : trade.validationWarnings.length > 0
              ? "warning"
              : "valid";

        const matchedPlans = findMatchingTradePlans(
          trade.ticker,
          openTradePlanMatchList,
        )
          .map((match) =>
            openTradePlanReferenceById.get(match.id as Id<"tradePlans">),
          )
          .filter((plan) => plan !== undefined);

        const assignedTradePlan =
          trade.tradePlanId !== undefined
            ? (assignedTradePlanById.get(trade.tradePlanId) ?? null)
            : null;

        const matchState:
          | "ambiguous"
          | "assigned"
          | "suggested"
          | "unmatched" =
          assignedTradePlan !== null
            ? "assigned"
            : matchedPlans.length === 1
              ? "suggested"
              : matchedPlans.length > 1
                ? "ambiguous"
                : "unmatched";

        const instrument =
          trade.assetType !== undefined && trade.ticker !== undefined
            ? instrumentByAssetTypeAndSymbol.get(
                `${trade.assetType}|${trade.ticker}`,
              )
            : undefined;
        const priceMapping: PriceMappingState =
          instrument === undefined
            ? { state: "missing" }
            : instrument.resolutionStatus === "resolved"
              ? {
                  state: "resolved",
                  instrumentId: instrument._id,
                  providerSymbol: instrument.providerSymbol ?? "",
                }
              : instrument.resolutionStatus === "ignored"
                ? { state: "ignored", instrumentId: instrument._id }
                : {
                    state: "needs_review",
                    instrumentId: instrument._id,
                    lastError: instrument.lastError,
                  };

        const isPriceMappingBlocking =
          priceMapping.state === "missing" ||
          priceMapping.state === "needs_review";
        const reviewState: "needs_review" | "ready" =
          readiness.isReady &&
          validationState !== "error" &&
          !isPriceMappingBlocking
            ? "ready"
            : "needs_review";

        return {
          inboxTrade: trade,
          matchContext: {
            assignedTradePlan,
            candidateCount: matchedPlans.length,
            suggestedTradePlans: matchedPlans,
            ticker: trade.ticker ?? null,
          },
          matchState,
          priceMapping,
          readiness,
          reviewState,
          validationState,
        };
      });

    const summary = rows.reduce(
      (counts, row) => {
        counts.totalPendingCount += 1;

        switch (row.matchState) {
          case "ambiguous":
            counts.ambiguousCount += 1;
            break;
          case "assigned":
            counts.assignedCount += 1;
            break;
          case "suggested":
            counts.suggestedCount += 1;
            break;
          case "unmatched":
            counts.unmatchedCount += 1;
            break;
        }

        switch (row.reviewState) {
          case "needs_review":
            counts.needsReviewCount += 1;
            break;
          case "ready":
            counts.readyCount += 1;
            break;
        }

        switch (row.validationState) {
          case "error":
            counts.errorCount += 1;
            break;
          case "valid":
            counts.validCount += 1;
            break;
          case "warning":
            counts.warningCount += 1;
            break;
        }

        return counts;
      },
      {
        ambiguousCount: 0,
        assignedCount: 0,
        errorCount: 0,
        needsReviewCount: 0,
        readyCount: 0,
        suggestedCount: 0,
        totalPendingCount: 0,
        unmatchedCount: 0,
        validCount: 0,
        warningCount: 0,
      },
    );

    return {
      referenceData: {
        accountMappings: [...accountMappings].sort(
          (a, b) =>
            a.source.localeCompare(b.source) ||
            a.accountId.localeCompare(b.accountId) ||
            a.friendlyName.localeCompare(b.friendlyName),
        ),
        campaigns: campaignReferences,
        openTradePlans: openTradePlanReferences,
        portfolios: portfolios.map((portfolio) => ({
          ...portfolio,
          tradeCount: tradeCountByPortfolioId.get(portfolio._id) ?? 0,
        })),
      },
      rows,
      summary,
    };
  },
});

export const listInboxTradesForTradePlan = query({
  args: {
    tradePlanId: v.id("tradePlans"),
  },
  returns: v.array(
    v.object({
      inboxTrade: inboxTradeValidator,
      matchType: v.union(v.literal("assigned"), v.literal("suggested")),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const tradePlan = assertOwner(
      await ctx.db.get(args.tradePlanId),
      ownerId,
      "Trade plan not found",
    );

    const normalizedSymbol = tradePlan.instrumentSymbol.toUpperCase();
    const [assigned, suggested] = await Promise.all([
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status_tradePlanId", (q) =>
          q
            .eq("ownerId", ownerId)
            .eq("status", "pending_review")
            .eq("tradePlanId", args.tradePlanId),
        )
        .collect(),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status_ticker", (q) =>
          q
            .eq("ownerId", ownerId)
            .eq("status", "pending_review")
            .eq("ticker", normalizedSymbol),
        )
        .collect(),
    ]);

    const sortedAssigned = assigned.sort(
      (a, b) => (b.date ?? b._creationTime) - (a.date ?? a._creationTime),
    );
    const sortedSuggested = suggested
      .filter((trade) => trade.tradePlanId === undefined)
      .sort((a, b) => (b.date ?? b._creationTime) - (a.date ?? a._creationTime));

    return [
      ...sortedAssigned.map((trade) => ({
        inboxTrade: trade,
        matchType: "assigned" as const,
      })),
      ...sortedSuggested.map((trade) => ({
        inboxTrade: trade,
        matchType: "suggested" as const,
      })),
    ];
  },
});

type AcceptCheckResult =
  | {
      ok: true;
      assetType: "crypto" | "stock";
      candidate: CanonicalCandidate;
      inboxTradeId: Id<"inboxTrades">;
      portfolioId: Id<"portfolios"> | undefined;
      tradePlanId: Id<"tradePlans"> | undefined;
    }
  | { ok: false; error: string };

const acceptCheckValidator = v.union(
  v.object({
    ok: v.literal(true),
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    candidate: v.object({
      assetType: v.union(v.literal("crypto"), v.literal("stock")),
      date: v.number(),
      direction: v.union(v.literal("long"), v.literal("short")),
      price: v.number(),
      quantity: v.number(),
      side: v.union(v.literal("buy"), v.literal("sell")),
      ticker: v.string(),
    }),
    inboxTradeId: v.id("inboxTrades"),
    portfolioId: v.optional(v.id("portfolios")),
    tradePlanId: v.optional(v.id("tradePlans")),
  }),
  v.object({
    ok: v.literal(false),
    error: v.string(),
  }),
);

export const checkInboxTradeForAcceptanceInternal = internalMutation({
  args: {
    inboxTradeId: v.id("inboxTrades"),
    ownerId: v.string(),
    portfolioId: v.optional(v.id("portfolios")),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: acceptCheckValidator,
  handler: async (ctx, args): Promise<AcceptCheckResult> => {
    const result = await checkInboxTradeForAcceptance(
      ctx,
      args.ownerId,
      args.inboxTradeId,
      {
        portfolioId: args.portfolioId,
        tradePlanId: args.tradePlanId,
      },
    );
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      assetType: result.assetType,
      candidate: result.candidate,
      inboxTradeId: result.inboxTrade._id,
      portfolioId: result.portfolioId,
      tradePlanId: result.tradePlanId,
    };
  },
});

export const commitInboxTradeAcceptanceInternal = internalMutation({
  args: {
    inboxTradeId: v.id("inboxTrades"),
    instrumentId: v.id("marketDataInstruments"),
    ownerId: v.string(),
    portfolioId: v.optional(v.id("portfolios")),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.object({
    accepted: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const checkResult = await checkInboxTradeForAcceptance(
      ctx,
      args.ownerId,
      args.inboxTradeId,
      {
        portfolioId: args.portfolioId,
        tradePlanId: args.tradePlanId,
      },
    );
    if (!checkResult.ok) {
      return { accepted: false, error: checkResult.error };
    }
    return await commitInboxTradeAcceptance(ctx, args.ownerId, {
      candidate: checkResult.candidate,
      inboxTrade: checkResult.inboxTrade,
      instrumentId: args.instrumentId,
      portfolioId: checkResult.portfolioId,
      tradePlanId: checkResult.tradePlanId,
    });
  },
});

export const listPendingInboxTradesInternal = internalQuery({
  args: { ownerId: v.string() },
  returns: v.array(v.id("inboxTrades")),
  handler: async (ctx, args): Promise<Id<"inboxTrades">[]> => {
    const trades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", args.ownerId).eq("status", "pending_review"),
      )
      .collect();
    return trades.map((trade) => trade._id);
  },
});

async function acceptInboxTradeViaAction(
  ctx: import("./_generated/server").ActionCtx,
  ownerId: string,
  inboxTradeId: Id<"inboxTrades">,
  args: {
    portfolioId?: Id<"portfolios">;
    tradePlanId?: Id<"tradePlans">;
  },
): Promise<{ accepted: boolean; error?: string }> {
  const check: AcceptCheckResult = await ctx.runMutation(
    internal.imports.checkInboxTradeForAcceptanceInternal,
    {
      inboxTradeId,
      ownerId,
      portfolioId: args.portfolioId,
      tradePlanId: args.tradePlanId,
    },
  );
  if (!check.ok) {
    return { accepted: false, error: check.error };
  }

  const resolution = await resolveInstrumentForOwner(ctx, ownerId, {
    assetType: check.assetType,
    ticker: check.candidate.ticker,
  });
  if (
    resolution.status !== "resolved" &&
    resolution.status !== "ignored"
  ) {
    return {
      accepted: false,
      error: `Price mapping required for ${check.candidate.ticker}: ${resolution.instrument.lastError ?? "instrument not resolved"}`,
    };
  }

  const result: { accepted: boolean; error?: string } = await ctx.runMutation(
    internal.imports.commitInboxTradeAcceptanceInternal,
    {
      inboxTradeId: check.inboxTradeId,
      instrumentId: resolution.instrument._id,
      ownerId,
      portfolioId: check.portfolioId,
      tradePlanId: check.tradePlanId,
    },
  );
  return result;
}

export const acceptTrade = action({
  args: {
    inboxTradeId: v.id("inboxTrades"),
    portfolioId: v.optional(v.id("portfolios")),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.object({
    accepted: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ accepted: boolean; error?: string }> => {
    const ownerId = await requireUser(ctx);
    return await acceptInboxTradeViaAction(ctx, ownerId, args.inboxTradeId, {
      portfolioId: args.portfolioId,
      tradePlanId: args.tradePlanId,
    });
  },
});

export const acceptAllTrades = action({
  args: {},
  returns: v.object({
    accepted: v.number(),
    errors: v.array(v.string()),
    skippedInvalid: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{
    accepted: number;
    errors: string[];
    skippedInvalid: number;
  }> => {
    const ownerId = await requireUser(ctx);
    const inboxTradeIds: Id<"inboxTrades">[] = await ctx.runQuery(
      internal.imports.listPendingInboxTradesInternal,
      { ownerId },
    );

    let accepted = 0;
    let skippedInvalid = 0;
    const errors: string[] = [];
    for (const inboxTradeId of inboxTradeIds) {
      const result = await acceptInboxTradeViaAction(
        ctx,
        ownerId,
        inboxTradeId,
        {},
      );
      if (result.accepted) {
        accepted++;
      } else {
        skippedInvalid++;
        if (result.error) {
          errors.push(`${inboxTradeId}: ${result.error}`);
        }
      }
    }
    return { accepted, errors, skippedInvalid };
  },
});

export const deleteInboxTrade = mutation({
  args: { inboxTradeId: v.id("inboxTrades") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const rawTrade = await ctx.db.get(args.inboxTradeId);
    const trade = assertOwner(rawTrade, ownerId, "Inbox trade not found");
    if (trade.status !== "pending_review") {
      throw new ConvexError("Can only delete pending review trades from inbox");
    }

    await ctx.db.delete(args.inboxTradeId);
    return null;
  },
});

export const deleteAllInboxTrades = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const pendingTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect();

    for (const trade of pendingTrades) {
      await ctx.db.delete(trade._id);
    }

    return pendingTrades.length;
  },
});

export const updateInboxTrade = mutation({
  args: {
    assetType: v.optional(
      v.union(v.literal("stock"), v.literal("crypto"), v.null()),
    ),
    date: v.optional(v.union(v.number(), v.null())),
    direction: v.optional(
      v.union(v.literal("long"), v.literal("short"), v.null()),
    ),
    inboxTradeId: v.id("inboxTrades"),
    portfolioId: v.optional(v.union(v.id("portfolios"), v.null())),
    price: v.optional(v.union(v.number(), v.null())),
    quantity: v.optional(v.union(v.number(), v.null())),
    side: v.optional(v.union(v.literal("buy"), v.literal("sell"), v.null())),
    ticker: v.optional(v.union(v.string(), v.null())),
    tradePlanId: v.optional(v.union(v.id("tradePlans"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { inboxTradeId, ...updates } = args;
    const rawTrade = await ctx.db.get(inboxTradeId);
    const trade = assertOwner(rawTrade, ownerId, "Inbox trade not found");
    if (trade.status !== "pending_review") {
      throw new ConvexError("Can only edit pending review trades");
    }

    if (updates.tradePlanId !== undefined && updates.tradePlanId !== null) {
      const tradePlan = await ctx.db.get(updates.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    if (updates.portfolioId !== undefined && updates.portfolioId !== null) {
      const portfolio = await ctx.db.get(updates.portfolioId);
      assertOwner(portfolio, ownerId, "Portfolio not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.direction !== undefined)
      patch.direction = updates.direction ?? undefined;
    if (updates.assetType !== undefined)
      patch.assetType = updates.assetType ?? undefined;
    if (updates.date !== undefined) patch.date = updates.date ?? undefined;
    if (updates.portfolioId !== undefined) {
      patch.portfolioId = updates.portfolioId ?? undefined;
    }
    if (updates.price !== undefined) patch.price = updates.price ?? undefined;
    if (updates.quantity !== undefined)
      patch.quantity = updates.quantity ?? undefined;
    if (updates.side !== undefined) patch.side = updates.side ?? undefined;
    if (updates.ticker !== undefined) {
      patch.ticker = updates.ticker
        ? updates.ticker.trim().toUpperCase()
        : undefined;
    }
    if (updates.tradePlanId !== undefined) {
      patch.tradePlanId = updates.tradePlanId ?? undefined;
    }

    const merged = {
      ...trade,
      ...patch,
    };
    const validation = validateInboxTradeCandidate(merged, {
      includeExisting: false,
    });
    if (merged.assetType && validation.normalizedTicker) {
      const instrument = await ensureMarketDataInstrumentReviewRecord(
        ctx,
        ownerId,
        merged.assetType,
        validation.normalizedTicker,
      );
      if (
        instrument !== null &&
        instrument.resolutionStatus !== "resolved" &&
        instrument.resolutionStatus !== "ignored"
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.marketData.resolveInstrumentInternal,
          {
            assetType: merged.assetType,
            ownerId,
            ticker: validation.normalizedTicker,
          },
        );
      }
    }
    patch.validationErrors = validation.validationErrors;
    patch.validationWarnings = validation.validationWarnings;
    patch.ticker = validation.normalizedTicker;

    await ctx.db.patch(inboxTradeId, patch);
    return null;
  },
});
