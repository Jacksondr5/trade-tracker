import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const sourceValidator = v.union(
  v.literal("manual"),
  v.literal("ibkr"),
  v.literal("kraken"),
);

const inboxTradeValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  brokerageAccountId: v.optional(v.string()),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  inboxStatus: v.optional(
    v.union(v.literal("pending_review"), v.literal("accepted")),
  ),
  notes: v.optional(v.string()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.optional(sourceValidator),
  taxes: v.optional(v.number()),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});

export const importTrades = mutation({
  args: {
    trades: v.array(
      v.object({
        assetType: v.union(v.literal("stock"), v.literal("crypto")),
        brokerageAccountId: v.optional(v.string()),
        date: v.number(),
        direction: v.union(v.literal("long"), v.literal("short")),
        externalId: v.string(),
        fees: v.optional(v.number()),
        notes: v.optional(v.string()),
        orderType: v.optional(v.string()),
        price: v.number(),
        quantity: v.number(),
        side: v.union(v.literal("buy"), v.literal("sell")),
        source: v.union(v.literal("ibkr"), v.literal("kraken")),
        taxes: v.optional(v.number()),
        ticker: v.string(),
      }),
    ),
  },
  returns: v.object({
    imported: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    // Build set of existing externalIds for dedup
    const existingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const existingExternalIds = new Set(
      existingTrades
        .filter((t) => t.externalId !== undefined)
        .map((t) => t.externalId!),
    );

    let imported = 0;
    let skipped = 0;

    for (const trade of args.trades) {
      if (existingExternalIds.has(trade.externalId)) {
        skipped++;
        continue;
      }

      await ctx.db.insert("trades", {
        assetType: trade.assetType,
        brokerageAccountId: trade.brokerageAccountId,
        date: trade.date,
        direction: trade.direction,
        externalId: trade.externalId,
        fees: trade.fees,
        inboxStatus: "pending_review",
        notes: trade.notes,
        orderType: trade.orderType,
        ownerId,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        source: trade.source,
        taxes: trade.taxes,
        ticker: trade.ticker,
      });

      // Track the new externalId so duplicates within the same batch are skipped
      existingExternalIds.add(trade.externalId);
      imported++;
    }

    return { imported, skipped };
  },
});

export const listInboxTrades = query({
  args: {},
  returns: v.array(inboxTradeValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner_inboxStatus", (q) =>
        q.eq("ownerId", ownerId).eq("inboxStatus", "pending_review"),
      )
      .collect();
    return trades.sort((a, b) => a.date - b.date);
  },
});

export const acceptTrade = mutation({
  args: {
    notes: v.optional(v.string()),
    tradePlanId: v.optional(v.id("tradePlans")),
    tradeId: v.id("trades"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const rawTrade = await ctx.db.get(args.tradeId);
    const trade = assertOwner(rawTrade, ownerId, "Trade not found");
    if (trade.inboxStatus !== "pending_review") {
      throw new Error("Trade is not pending review");
    }

    const patch: Record<string, unknown> = { inboxStatus: "accepted" };
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.tradePlanId !== undefined) {
      const tradePlan = await ctx.db.get(args.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
      patch.tradePlanId = args.tradePlanId;
    }

    await ctx.db.patch(args.tradeId, patch);
    return null;
  },
});

export const acceptAllTrades = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const pendingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner_inboxStatus", (q) =>
        q.eq("ownerId", ownerId).eq("inboxStatus", "pending_review"),
      )
      .collect();
    for (const trade of pendingTrades) {
      await ctx.db.patch(trade._id, { inboxStatus: "accepted" });
    }
    return pendingTrades.length;
  },
});

export const deleteInboxTrade = mutation({
  args: { tradeId: v.id("trades") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const rawTrade = await ctx.db.get(args.tradeId);
    const trade = assertOwner(rawTrade, ownerId, "Trade not found");
    if (trade.inboxStatus !== "pending_review") {
      throw new Error("Can only delete pending review trades from inbox");
    }
    await ctx.db.delete(args.tradeId);
    return null;
  },
});

export const deleteAllInboxTrades = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const pendingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner_inboxStatus", (q) =>
        q.eq("ownerId", ownerId).eq("inboxStatus", "pending_review"),
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
    assetType: v.optional(v.union(v.literal("stock"), v.literal("crypto"))),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
    notes: v.optional(v.string()),
    tradePlanId: v.optional(v.id("tradePlans")),
    tradeId: v.id("trades"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradeId, ...updates } = args;
    const rawTrade = await ctx.db.get(tradeId);
    const trade = assertOwner(rawTrade, ownerId, "Trade not found");
    if (trade.inboxStatus !== "pending_review") {
      throw new Error("Can only edit pending review trades");
    }

    if (updates.tradePlanId !== undefined) {
      const tradePlan = await ctx.db.get(updates.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.direction !== undefined) patch.direction = updates.direction;
    if (updates.assetType !== undefined) patch.assetType = updates.assetType;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.tradePlanId !== undefined)
      patch.tradePlanId = updates.tradePlanId;

    await ctx.db.patch(tradeId, patch);
    return null;
  },
});
