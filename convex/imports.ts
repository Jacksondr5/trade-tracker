import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { validateInboxTradeCandidate } from "../shared/imports/validation";

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
  price: v.optional(v.number()),
  quantity: v.optional(v.number()),
  side: v.optional(v.union(v.literal("buy"), v.literal("sell"))),
  source: sourceValidator,
  status: v.union(
    v.literal("pending_review"),
  ),
  taxes: v.optional(v.number()),
  ticker: v.optional(v.string()),
  tradePlanId: v.optional(v.id("tradePlans")),
  validationErrors: v.array(v.string()),
  validationWarnings: v.array(v.string()),
});

function dedupKey(source: "ibkr" | "kraken", externalId: string): string {
  return `${source}|${externalId}`;
}

async function acceptInboxTradeInternal(
  ctx: MutationCtx,
  ownerId: string,
  inboxTradeId: Id<"inboxTrades">,
  args: {
    notes?: string;
    tradePlanId?: Id<"tradePlans">;
  },
): Promise<{ accepted: boolean; error?: string }> {
  const rawInboxTrade = await ctx.db.get(inboxTradeId);
  const inboxTrade = assertOwner(rawInboxTrade, ownerId, "Inbox trade not found");

  if (inboxTrade.status !== "pending_review") {
    return { accepted: false, error: "Trade is not pending review" };
  }

  const notes = args.notes !== undefined ? args.notes : inboxTrade.notes;
  const tradePlanId =
    args.tradePlanId !== undefined ? args.tradePlanId : inboxTrade.tradePlanId;

  if (tradePlanId !== undefined) {
    const tradePlan = await ctx.db.get(tradePlanId);
    assertOwner(tradePlan, ownerId, "Trade plan not found");
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
    brokerageAccountId: inboxTrade.brokerageAccountId,
    date: candidate.date,
    direction: candidate.direction,
    externalId: inboxTrade.externalId,
    fees: inboxTrade.fees,
    notes,
    orderType: inboxTrade.orderType,
    ownerId,
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
          (t): t is typeof t & { externalId: string; source: "ibkr" | "kraken" } =>
            t.externalId !== undefined &&
            (t.source === "ibkr" || t.source === "kraken"),
        )
        .map((t) => dedupKey(t.source, t.externalId)),
      ...existingPendingInboxTrades
        .filter((t): t is typeof t & { externalId: string } => t.externalId !== undefined)
        .map((t) => dedupKey(t.source, t.externalId)),
    ]);

    let imported = 0;
    let skippedDuplicates = 0;
    let withValidationErrors = 0;
    let withWarnings = 0;

    for (const trade of args.trades) {
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
        const tradePlan = await ctx.db.get(trade.tradePlanId);
        assertOwner(tradePlan, ownerId, "Trade plan not found");
      }

      await ctx.db.insert("inboxTrades", {
        assetType: trade.assetType,
        brokerageAccountId: trade.brokerageAccountId,
        date: trade.date,
        direction: trade.direction,
        externalId: trade.externalId,
        fees: trade.fees,
        notes: trade.notes,
        orderType: trade.orderType,
        ownerId,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        source: trade.source,
        status: "pending_review",
        taxes: trade.taxes,
        ticker: validation.normalizedTicker,
        tradePlanId: trade.tradePlanId,
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

    return trades.sort((a, b) => (b.date ?? b._creationTime) - (a.date ?? a._creationTime));
  },
});

export const acceptTrade = mutation({
  args: {
    inboxTradeId: v.id("inboxTrades"),
    notes: v.optional(v.string()),
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
      const result = await acceptInboxTradeInternal(ctx, ownerId, trade._id, {});
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
      throw new Error("Can only delete pending review trades from inbox");
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
    assetType: v.optional(v.union(v.literal("stock"), v.literal("crypto"), v.null())),
    date: v.optional(v.union(v.number(), v.null())),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"), v.null())),
    inboxTradeId: v.id("inboxTrades"),
    notes: v.optional(v.union(v.string(), v.null())),
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
      throw new Error("Can only edit pending review trades");
    }

    if (updates.tradePlanId !== undefined && updates.tradePlanId !== null) {
      const tradePlan = await ctx.db.get(updates.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.direction !== undefined) patch.direction = updates.direction ?? undefined;
    if (updates.assetType !== undefined) patch.assetType = updates.assetType ?? undefined;
    if (updates.date !== undefined) patch.date = updates.date ?? undefined;
    if (updates.notes !== undefined) patch.notes = updates.notes ?? undefined;
    if (updates.price !== undefined) patch.price = updates.price ?? undefined;
    if (updates.quantity !== undefined) patch.quantity = updates.quantity ?? undefined;
    if (updates.side !== undefined) patch.side = updates.side ?? undefined;
    if (updates.ticker !== undefined) {
      patch.ticker = updates.ticker ? updates.ticker.trim().toUpperCase() : undefined;
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
