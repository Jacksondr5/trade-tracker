import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
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

const sourceValidator = v.union(v.literal("ibkr"), v.literal("kraken"));

const inboxTradeValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("inboxTrades"),
  assetType: v.optional(v.union(v.literal("crypto"), v.literal("stock"))),
  brokerageAccountId: v.optional(v.string()),
  date: v.optional(v.number()),
  direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  notes: v.optional(v.string()),
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
    needsReviewCount: v.number(),
    readyCount: v.number(),
    suggestedCount: v.number(),
    totalPendingCount: v.number(),
    unmatchedCount: v.number(),
    validCount: v.number(),
    warningCount: v.number(),
  }),
});

function dedupKey(source: "ibkr" | "kraken", externalId: string): string {
  return `${source}|${externalId}`;
}

function normalizeBrokerageAccountId(
  source: "ibkr" | "kraken",
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

async function acceptInboxTradeInternal(
  ctx: MutationCtx,
  ownerId: string,
  inboxTradeId: Id<"inboxTrades">,
  args: {
    notes?: string;
    portfolioId?: Id<"portfolios">;
    tradePlanId?: Id<"tradePlans">;
  },
): Promise<{ accepted: boolean; error?: string }> {
  const rawInboxTrade = await ctx.db.get(inboxTradeId);
  const inboxTrade = assertOwner(
    rawInboxTrade,
    ownerId,
    "Inbox trade not found",
  );

  if (inboxTrade.status !== "pending_review") {
    return { accepted: false, error: "Trade is not pending review" };
  }

  const notes = args.notes !== undefined ? args.notes : inboxTrade.notes;
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
    return { accepted: false, error: validation.validationErrors.join("; ") };
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

  await ctx.db.insert("trades", {
    assetType: candidate.assetType,
    brokerageAccountId: normalizeBrokerageAccountId(
      inboxTrade.source,
      inboxTrade.brokerageAccountId,
    ),
    date: candidate.date,
    direction: candidate.direction,
    externalId: inboxTrade.externalId,
    fees: inboxTrade.fees,
    notes,
    orderType: inboxTrade.orderType,
    ownerId,
    portfolioId,
    price: candidate.price,
    quantity: candidate.quantity,
    side: candidate.side,
    source: inboxTrade.source,
    taxes: inboxTrade.taxes,
    ticker: candidate.ticker,
    tradePlanId,
  });

  await ctx.db.delete(inboxTrade._id);

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
        notes: v.optional(v.string()),
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
            source: "ibkr" | "kraken";
          } =>
            t.externalId !== undefined &&
            (t.source === "ibkr" || t.source === "kraken"),
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

      await ctx.db.insert("inboxTrades", {
        assetType: trade.assetType,
        brokerageAccountId,
        date: trade.date,
        direction: trade.direction,
        externalId: trade.externalId,
        fees: trade.fees,
        notes: trade.notes,
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
        const reviewState: "needs_review" | "ready" =
          readiness.isReady && validationState !== "error"
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
          readiness,
          reviewState,
          validationState,
        };
      });

    const summary = {
      ambiguousCount: rows.filter((row) => row.matchState === "ambiguous")
        .length,
      assignedCount: rows.filter((row) => row.matchState === "assigned").length,
      needsReviewCount: rows.filter((row) => row.reviewState === "needs_review")
        .length,
      readyCount: rows.filter((row) => row.reviewState === "ready").length,
      suggestedCount: rows.filter((row) => row.matchState === "suggested")
        .length,
      totalPendingCount: rows.length,
      unmatchedCount: rows.filter((row) => row.matchState === "unmatched")
        .length,
      validCount: rows.filter((row) => row.validationState === "valid").length,
      warningCount: rows.filter((row) => row.validationState === "warning")
        .length,
    };

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

export const acceptTrade = mutation({
  args: {
    inboxTradeId: v.id("inboxTrades"),
    notes: v.optional(v.string()),
    portfolioId: v.optional(v.id("portfolios")),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.object({
    accepted: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return await acceptInboxTradeInternal(ctx, ownerId, args.inboxTradeId, {
      notes: args.notes,
      portfolioId: args.portfolioId,
      tradePlanId: args.tradePlanId,
    });
  },
});

export const acceptAllTrades = mutation({
  args: {},
  returns: v.object({
    accepted: v.number(),
    errors: v.array(v.string()),
    skippedInvalid: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const pendingTrades = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "pending_review"),
      )
      .collect();

    let accepted = 0;
    let skippedInvalid = 0;
    const errors: string[] = [];

    for (const trade of pendingTrades) {
      const result = await acceptInboxTradeInternal(
        ctx,
        ownerId,
        trade._id,
        {},
      );
      if (result.accepted) {
        accepted++;
      } else {
        skippedInvalid++;
        if (result.error) {
          errors.push(`${trade._id}: ${result.error}`);
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
    notes: v.optional(v.union(v.string(), v.null())),
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
    if (updates.notes !== undefined) patch.notes = updates.notes ?? undefined;
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
    patch.validationErrors = validation.validationErrors;
    patch.validationWarnings = validation.validationWarnings;
    patch.ticker = validation.normalizedTicker;

    await ctx.db.patch(inboxTradeId, patch);
    return null;
  },
});
