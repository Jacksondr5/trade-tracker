import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  brokerageConnections: defineTable({
    accountRef: v.string(),
    provider: v.union(v.literal("ibkr"), v.literal("kraken")),
    status: v.union(
      v.literal("active"),
      v.literal("disconnected"),
      v.literal("error"),
      v.literal("needs_reauth"),
    ),
  })
    .index("by_provider", ["provider"])
    .index("by_status", ["status"]),

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

  externalExecutions: defineTable({
    accountRef: v.string(),
    externalExecutionId: v.optional(v.string()),
    externalOrderId: v.optional(v.string()),
    identityKind: v.union(v.literal("hash"), v.literal("native")),
    identityValue: v.string(),
    occurredAt: v.number(),
    provider: v.union(v.literal("ibkr"), v.literal("kraken")),
    rawPayload: v.optional(v.any()),
    symbol: v.string(),
    tradeId: v.optional(v.id("trades")),
  })
    .index("by_identity", ["provider", "accountRef", "identityValue"])
    .index("by_tradeId", ["tradeId"]),

  importCursorState: defineTable({
    accountRef: v.string(),
    cursorTimestamp: v.optional(v.number()),
    cursorToken: v.optional(v.string()),
    provider: v.union(v.literal("ibkr"), v.literal("kraken")),
    updatedAt: v.number(),
  }).index("by_provider_account", ["provider", "accountRef"]),

  importJobs: defineTable({
    connectionId: v.id("brokerageConnections"),
    errorMessage: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    provider: v.union(v.literal("ibkr"), v.literal("kraken")),
    startedAt: v.number(),
    status: v.union(
      v.literal("blocked_reauth"),
      v.literal("failed"),
      v.literal("partial"),
      v.literal("running"),
      v.literal("succeeded"),
    ),
  }).index("by_connectionId", ["connectionId"]),

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
    brokerAccountRef: v.optional(v.string()),
    campaignId: v.optional(v.id("campaigns")),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    externalExecutionId: v.optional(v.string()),
    externalOrderId: v.optional(v.string()),
    importJobId: v.optional(v.id("importJobs")),
    inboxStatus: v.optional(
      v.union(v.literal("pending_review"), v.literal("reviewed")),
    ),
    notes: v.optional(v.string()),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    source: v.union(
      v.literal("ibkr"),
      v.literal("kraken"),
      v.literal("manual"),
    ),
    suggestedTradePlanId: v.optional(v.id("tradePlans")),
    suggestionReason: v.optional(
      v.union(v.literal("none"), v.literal("symbol_and_side_match")),
    ),
    ticker: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  })
    .index("by_campaignId", ["campaignId"])
    .index("by_date", ["date"])
    .index("by_importJobId", ["importJobId"])
    .index("by_inboxStatus", ["inboxStatus"])
    .index("by_tradePlanId", ["tradePlanId"])
    .index("by_ticker", ["ticker"]),
});
