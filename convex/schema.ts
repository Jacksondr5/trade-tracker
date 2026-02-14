import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  campaignNotes: defineTable({
    campaignId: v.id("campaigns"),
    content: v.string(),
  }).index("by_campaignId", ["campaignId"]),

  campaigns: defineTable({
    closedAt: v.optional(v.number()),
    name: v.string(),
    retrospective: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("planning"),
    ),
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

  tradePlans: defineTable({
    campaignId: v.optional(v.id("campaigns")),
    closedAt: v.optional(v.number()),
    entryConditions: v.string(),
    exitConditions: v.string(),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.string(),
    instrumentType: v.optional(v.string()),
    invalidatedAt: v.optional(v.number()),
    name: v.string(),
    rationale: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("idea"),
      v.literal("watching"),
    ),
    targetConditions: v.string(),
  })
    .index("by_campaignId", ["campaignId"])
    .index("by_status", ["status"]),

  trades: defineTable({
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    notes: v.optional(v.string()),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    ticker: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  })
    .index("by_date", ["date"])
    .index("by_tradePlanId", ["tradePlanId"])
    .index("by_ticker", ["ticker"]),
});
