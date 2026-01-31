import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Reusable validator for instruments (tradeable ticker with optional underlying asset mapping)
const instrumentValidator = v.object({
  notes: v.optional(v.string()),
  ticker: v.string(),
  underlying: v.optional(v.string()),
});

// Reusable validator for price targets (entry and profit targets)
const targetValidator = v.object({
  notes: v.optional(v.string()),
  percentage: v.optional(v.number()),
  price: v.number(),
  ticker: v.string(),
});

// Validator for stop loss entries with timestamp
const stopLossValidator = v.object({
  price: v.number(),
  reason: v.optional(v.string()),
  setAt: v.number(),
  ticker: v.string(),
});

export default defineSchema({
  campaignNotes: defineTable({
    campaignId: v.id("campaigns"),
    content: v.string(),
  }).index("by_campaignId", ["campaignId"]),

  campaigns: defineTable({
    closedAt: v.optional(v.number()),
    entryTargets: v.array(targetValidator),
    instruments: v.array(instrumentValidator),
    name: v.string(),
    outcome: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("profit_target"),
        v.literal("stop_loss"),
      ),
    ),
    profitTargets: v.array(targetValidator),
    retrospective: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("planning"),
    ),
    stopLossHistory: v.array(stopLossValidator),
    thesis: v.string(),
  }).index("by_status", ["status"]),

  portfolioSnapshots: defineTable({
    cashBalance: v.optional(v.number()),
    date: v.number(),
    source: v.union(
      v.literal("api"),
      v.literal("calculated"),
      v.literal("manual"),
    ),
    totalValue: v.number(),
  }).index("by_date", ["date"]),

  trades: defineTable({
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    campaignId: v.optional(v.id("campaigns")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    notes: v.optional(v.string()),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    ticker: v.string(),
  })
    .index("by_campaignId", ["campaignId"])
    .index("by_date", ["date"])
    .index("by_ticker", ["ticker"]),
});
