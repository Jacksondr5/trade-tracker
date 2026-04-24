import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  campaignStatusValidator,
  tradePlanStatusValidator,
} from "./lib/statuses";

const importTaskStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("error"),
);

const importTaskModeValidator = v.union(
  v.literal("create"),
  v.literal("follow-up"),
);

export default defineSchema({
  importTasks: defineTable({
    chartUrls: v.optional(v.array(v.string())),
    createdTradePlanId: v.optional(v.id("tradePlans")),
    dismissedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    extractedData: v.optional(v.string()),
    inboxTradeId: v.optional(v.id("inboxTrades")),
    mode: importTaskModeValidator,
    ownerId: v.string(),
    pastedText: v.string(),
    sourceUrl: v.optional(v.string()),
    status: importTaskStatusValidator,
    tradePlanId: v.optional(v.id("tradePlans")),
  }).index("by_owner", ["ownerId"]),

  notes: defineTable({
    campaignId: v.optional(v.id("campaigns")),
    chartUrls: v.optional(v.array(v.string())),
    content: v.string(),
    evidence: v.optional(
      v.array(
        v.object({
          contentType: v.optional(v.string()),
          fileName: v.optional(v.string()),
          kind: v.union(v.literal("chart"), v.literal("image")),
          storageId: v.optional(v.id("_storage")),
          url: v.optional(v.string()),
        }),
      ),
    ),
    noteDate: v.number(),
    ownerId: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_campaignId", ["ownerId", "campaignId"])
    .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"]),

  campaigns: defineTable({
    closedAt: v.optional(v.number()),
    name: v.string(),
    ownerId: v.string(),
    status: campaignStatusValidator,
    thesis: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"]),

  watchlist: defineTable({
    campaignId: v.optional(v.id("campaigns")),
    itemType: v.union(v.literal("campaign"), v.literal("tradePlan")),
    ownerId: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
    watchedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_watchedAt", ["ownerId", "watchedAt"])
    .index("by_owner_campaignId", ["ownerId", "campaignId"])
    .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"]),

  portfolios: defineTable({
    name: v.string(),
    ownerId: v.string(),
  }).index("by_owner", ["ownerId"]),

  tradePlans: defineTable({
    campaignId: v.optional(v.id("campaigns")),
    closedAt: v.optional(v.number()),
    entryConditions: v.optional(v.string()),
    exitConditions: v.optional(v.string()),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.string(),
    instrumentType: v.optional(v.string()),
    invalidatedAt: v.optional(v.number()),
    name: v.string(),
    ownerId: v.string(),
    rationale: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    status: tradePlanStatusValidator,
    targetConditions: v.optional(v.string()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_campaignId", ["ownerId", "campaignId"])
    .index("by_owner_campaignId_status", ["ownerId", "campaignId", "status"]),

  accountMappings: defineTable({
    accountId: v.string(),
    friendlyName: v.string(),
    ownerId: v.string(),
    source: v.union(v.literal("ibkr"), v.literal("kraken")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_source_accountId", ["ownerId", "source", "accountId"]),

  trades: defineTable({
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    brokerageAccountId: v.optional(v.string()),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    externalId: v.optional(v.string()),
    fees: v.optional(v.number()),
    orderType: v.optional(v.string()),
    ownerId: v.string(),
    portfolioId: v.optional(v.id("portfolios")),
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
    .index("by_owner_portfolioId", ["ownerId", "portfolioId"])
    .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"]),

  inboxTrades: defineTable({
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
    source: v.union(v.literal("ibkr"), v.literal("kraken")),
    status: v.literal("pending_review"),
    taxes: v.optional(v.number()),
    ticker: v.optional(v.string()),
    tradePlanId: v.optional(v.id("tradePlans")),
    validationErrors: v.array(v.string()),
    validationWarnings: v.array(v.string()),
  })
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_source_externalId", ["ownerId", "source", "externalId"])
    .index("by_owner_portfolioId", ["ownerId", "portfolioId"])
    .index("by_owner_date", ["ownerId", "date"])
    .index("by_owner_status_tradePlanId", ["ownerId", "status", "tradePlanId"])
    .index("by_owner_status_ticker", ["ownerId", "status", "ticker"]),

  retrospectives: defineTable({
    content: v.string(),
    ownerId: v.string(),
    parentId: v.union(v.id("campaigns"), v.id("tradePlans")),
    parentKind: v.union(v.literal("campaign"), v.literal("tradePlan")),
    updatedAt: v.number(),
  }).index("by_owner_parent", ["ownerId", "parentId"]),

  strategyDoc: defineTable({
    content: v.string(),
    ownerId: v.string(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
