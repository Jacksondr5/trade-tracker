import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  campaignNotes: defineTable({
    campaignId: v.id("campaigns"),
    content: v.string(),
    ownerId: v.string(),
  }).index("by_owner_campaignId", ["ownerId", "campaignId"]),

  campaigns: defineTable({
    closedAt: v.optional(v.number()),
    name: v.string(),
    ownerId: v.string(),
    retrospective: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("closed"),
      v.literal("planning"),
    ),
    thesis: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"]),

  portfolioSnapshots: defineTable({
    cashBalance: v.optional(v.number()),
    date: v.number(),
    ownerId: v.string(),
    source: v.union(
      v.literal("api"),
      v.literal("calculated"),
      v.literal("manual"),
    ),
    totalValue: v.number(),
  }).index("by_owner_date", ["ownerId", "date"]),

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
    ownerId: v.string(),
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
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_campaignId", ["ownerId", "campaignId"]),

  trades: defineTable({
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
    source: v.optional(
      v.union(v.literal("manual"), v.literal("ibkr"), v.literal("kraken")),
    ),
    taxes: v.optional(v.number()),
    ticker: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_date", ["ownerId", "date"])
    .index("by_owner_externalId", ["ownerId", "externalId"])
    .index("by_owner_inboxStatus", ["ownerId", "inboxStatus"])
    .index("by_owner_ticker", ["ownerId", "ticker"])
    .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"]),
});
