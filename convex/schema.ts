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

const bravosConnectionStatusValidator = v.union(
  v.literal("not_connected"),
  v.literal("connected"),
  v.literal("needs_reconnect"),
);

const bravosReviewStateValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("needs_attention"),
  v.literal("approved"),
  v.literal("dismissed"),
  v.literal("failed"),
);

const bravosSyncRunKindValidator = v.union(
  v.literal("direct_post_fetch"),
  v.literal("listing_scan"),
  v.literal("scheduled_scan"),
);

const bravosSyncRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("error"),
);

const portfolioCashLedgerEntryTypeValidator = v.union(
  v.literal("deposit"),
  v.literal("withdrawal"),
  v.literal("correction"),
);

const marketDataAssetTypeValidator = v.union(
  v.literal("crypto"),
  v.literal("stock"),
);

const marketDataProviderValidator = v.literal("twelve_data");

const marketDataInstrumentResolutionStatusValidator = v.union(
  v.literal("resolved"),
  v.literal("needs_review"),
  v.literal("ignored"),
);

const marketPriceSnapshotStatusValidator = v.union(
  v.literal("ok"),
  v.literal("missing"),
  v.literal("error"),
);

const portfolioDailyValuationPriceCoverageStatusValidator = v.union(
  v.literal("complete"),
  v.literal("partial"),
  v.literal("missing"),
);

const marketDataRefreshRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("partial"),
);

const marketDataFetchJobKindValidator = v.union(
  v.literal("daily_snapshot"),
  v.literal("historical_backfill"),
);

const marketDataFetchJobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("leased"),
  v.literal("completed"),
  v.literal("failed"),
);

const portfolioPipelineModeValidator = v.union(
  v.literal("daily"),
  v.literal("backfill"),
  v.literal("recompute"),
);

const portfolioPipelineRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const portfolioPipelineDateRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("skipped"),
);

const brokerageSourceValidator = v.literal("ibkr");

const brokerageConnectionStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("needs_setup"),
  v.literal("error"),
);

const brokerageSyncReportTypeValidator = v.union(
  v.literal("activity"),
  v.literal("trade_confirmation"),
);

const brokerageSyncRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("requesting"),
  v.literal("waiting_for_statement"),
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("failed_retryable"),
  v.literal("failed_terminal"),
);

const brokerageReconciliationIssueStatusValidator = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

const brokerageReconciliationIssueTypeValidator = v.union(
  v.literal("position_mismatch"),
  v.literal("missing_local_position"),
  v.literal("missing_brokerage_position"),
  v.literal("cash_mismatch"),
  v.literal("pending_import_review"),
);

const brokerageReconciliationIssueSeverityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("error"),
);

const bravosClassificationValidator = v.union(
  v.literal("initiate"),
  v.literal("follow_up"),
  v.literal("unknown"),
);

const bravosFollowUpFieldValidator = v.union(
  v.literal("entryConditions"),
  v.literal("exitConditions"),
  v.literal("instrumentNotes"),
  v.literal("rationale"),
  v.literal("targetConditions"),
);

const bravosProposedActionValidator = v.union(
  v.object({
    kind: v.literal("create_trade_plan"),
    entryConditions: v.optional(v.string()),
    exitConditions: v.optional(v.string()),
    instrumentNotes: v.optional(v.string()),
    instrumentSymbol: v.string(),
    instrumentType: v.optional(v.string()),
    name: v.string(),
    rationale: v.optional(v.string()),
    targetConditions: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("apply_follow_up"),
    fieldUpdates: v.array(
      v.object({
        field: bravosFollowUpFieldValidator,
        text: v.string(),
      }),
    ),
    noteContent: v.optional(v.string()),
    targetTradePlanId: v.optional(v.id("tradePlans")),
  }),
  v.object({
    kind: v.literal("note_only"),
    content: v.string(),
    targetTradePlanId: v.optional(v.id("tradePlans")),
  }),
  v.object({
    kind: v.literal("unknown"),
    reason: v.optional(v.string()),
  }),
);

export default defineSchema({
  bravosConnections: defineTable({
    browserbaseContextId: v.optional(v.string()),
    browserbaseLoginSessionId: v.optional(v.string()),
    browserbaseLoginSessionReleasedAt: v.optional(v.number()),
    browserbaseLoginSessionStartedAt: v.optional(v.number()),
    connectionError: v.optional(v.string()),
    lastFailedSyncAt: v.optional(v.number()),
    lastLiveViewUrl: v.optional(v.string()),
    lastSuccessfulSyncAt: v.optional(v.number()),
    listingUrl: v.optional(v.string()),
    ownerId: v.string(),
    reconnectReason: v.optional(v.string()),
    status: bravosConnectionStatusValidator,
    updatedAt: v.number(),
  }).index("by_ownerId", ["ownerId"]),

  bravosReviewItems: defineTable({
    aiOutput: v.optional(v.string()),
    approvedAction: v.optional(bravosProposedActionValidator),
    approvedAt: v.optional(v.number()),
    appliedNoteId: v.optional(v.id("notes")),
    appliedTradePlanId: v.optional(v.id("tradePlans")),
    canonicalSourceIdentity: v.string(),
    classification: bravosClassificationValidator,
    dismissedAt: v.optional(v.number()),
    fetchSource: bravosSyncRunKindValidator,
    fetchedAt: v.number(),
    imageUrls: v.array(v.string()),
    lastFetchedAt: v.number(),
    lastProcessedAt: v.optional(v.number()),
    listingUrl: v.optional(v.string()),
    ownerId: v.string(),
    processingError: v.optional(v.string()),
    proposedAction: bravosProposedActionValidator,
    rawText: v.string(),
    reviewState: bravosReviewStateValidator,
    sourcePostDate: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourcePublishedAt: v.optional(v.number()),
    sourceUrl: v.string(),
    suggestedTradePlanId: v.optional(v.id("tradePlans")),
    suggestedTradePlanReason: v.optional(v.string()),
    syncRunId: v.optional(v.id("bravosSyncRuns")),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_canonicalSourceIdentity", [
      "ownerId",
      "canonicalSourceIdentity",
    ])
    .index("by_ownerId_and_reviewState", ["ownerId", "reviewState"]),

  bravosSyncRuns: defineTable({
    completedAt: v.optional(v.number()),
    connectionId: v.optional(v.id("bravosConnections")),
    error: v.optional(v.string()),
    kind: bravosSyncRunKindValidator,
    ownerId: v.string(),
    requestedAt: v.number(),
    requestedSourceUrl: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    status: bravosSyncRunStatusValidator,
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_status", ["status"]),

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

  portfolioCashLedgerEntries: defineTable({
    amount: v.number(),
    createdAt: v.number(),
    date: v.number(),
    entryType: portfolioCashLedgerEntryTypeValidator,
    note: v.optional(v.string()),
    ownerId: v.string(),
    portfolioId: v.id("portfolios"),
    updatedAt: v.number(),
  })
    .index("by_ownerId_and_portfolioId_and_date", [
      "ownerId",
      "portfolioId",
      "date",
    ])
    .index("by_ownerId_and_date", ["ownerId", "date"]),

  marketDataInstruments: defineTable({
    assetType: marketDataAssetTypeValidator,
    createdAt: v.number(),
    lastError: v.optional(v.string()),
    lastResolvedAt: v.optional(v.number()),
    ownerId: v.string(),
    provider: marketDataProviderValidator,
    providerSymbol: v.optional(v.string()),
    resolutionStatus: marketDataInstrumentResolutionStatusValidator,
    symbol: v.string(),
    updatedAt: v.number(),
  })
    .index("by_ownerId_and_assetType_and_symbol", [
      "ownerId",
      "assetType",
      "symbol",
    ])
    .index("by_ownerId_and_resolutionStatus", ["ownerId", "resolutionStatus"]),

  marketPriceSnapshots: defineTable({
    close: v.optional(v.number()),
    date: v.string(),
    errorMessage: v.optional(v.string()),
    fetchedAt: v.number(),
    provider: marketDataProviderValidator,
    providerSymbol: v.string(),
    status: marketPriceSnapshotStatusValidator,
  })
    .index("by_provider_and_providerSymbol_and_date", [
      "provider",
      "providerSymbol",
      "date",
    ])
    .index("by_date", ["date"]),

  portfolioPriceMarks: defineTable({
    assetType: marketDataAssetTypeValidator,
    createdAt: v.number(),
    date: v.string(),
    direction: v.union(v.literal("long"), v.literal("short")),
    ownerId: v.string(),
    portfolioId: v.id("portfolios"),
    price: v.number(),
    source: v.literal("last_trade"),
    sourceTradeId: v.id("trades"),
    symbol: v.string(),
    updatedAt: v.number(),
  })
    .index("by_portfolio_mark_lookup", [
      "ownerId",
      "portfolioId",
      "assetType",
      "symbol",
      "direction",
      "date",
    ])
    .index("by_ownerId_and_portfolioId_and_date", [
      "ownerId",
      "portfolioId",
      "date",
    ]),

  portfolioDailyValuations: defineTable({
    cashBalance: v.number(),
    computedAt: v.number(),
    date: v.string(),
    marketValue: v.number(),
    missingSymbols: v.array(v.string()),
    ownerId: v.string(),
    portfolioId: v.id("portfolios"),
    priceCoverageStatus: portfolioDailyValuationPriceCoverageStatusValidator,
    totalEquity: v.number(),
  })
    .index("by_ownerId_and_portfolioId_and_date", [
      "ownerId",
      "portfolioId",
      "date",
    ])
    .index("by_ownerId_and_date", ["ownerId", "date"]),

  marketDataRefreshRuns: defineTable({
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    ownerId: v.string(),
    provider: marketDataProviderValidator,
    runDate: v.string(),
    startedAt: v.number(),
    status: marketDataRefreshRunStatusValidator,
    symbolsFailed: v.number(),
    symbolsRequested: v.number(),
    symbolsSucceeded: v.number(),
  })
    .index("by_ownerId_and_runDate", ["ownerId", "runDate"])
    .index("by_ownerId_and_startedAt", ["ownerId", "startedAt"])
    .index("by_ownerId_and_status", ["ownerId", "status"]),

  marketDataFetchJobs: defineTable({
    assetType: marketDataAssetTypeValidator,
    attempts: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    date: v.optional(v.string()),
    endDate: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    estimatedCredits: v.number(),
    kind: marketDataFetchJobKindValidator,
    leasedAt: v.optional(v.number()),
    leaseExpiresAt: v.optional(v.number()),
    ownerId: v.string(),
    provider: marketDataProviderValidator,
    providerSymbol: v.optional(v.string()),
    runId: v.id("marketDataRefreshRuns"),
    sourceTradeIds: v.array(v.id("trades")),
    startDate: v.optional(v.string()),
    status: marketDataFetchJobStatusValidator,
    symbol: v.string(),
    updatedAt: v.number(),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_status_and_leaseExpiresAt", ["status", "leaseExpiresAt"])
    .index("by_runId", ["runId"])
    .index("by_runId_and_status", ["runId", "status"])
    .index("by_runId_and_status_and_updatedAt", [
      "runId",
      "status",
      "updatedAt",
    ])
    .index("by_ownerId_and_status_and_updatedAt", [
      "ownerId",
      "status",
      "updatedAt",
    ]),

  portfolioPipelineRuns: defineTable({
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    mode: portfolioPipelineModeValidator,
    ownerId: v.string(),
    requestedAt: v.number(),
    requestedByOwnerId: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    status: portfolioPipelineRunStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_ownerId_and_requestedAt", ["ownerId", "requestedAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  portfolioPipelineDateRuns: defineTable({
    completedAt: v.optional(v.number()),
    date: v.string(),
    errorMessage: v.optional(v.string()),
    mode: portfolioPipelineModeValidator,
    ownerId: v.string(),
    pipelineRunId: v.id("portfolioPipelineRuns"),
    startedAt: v.optional(v.number()),
    status: portfolioPipelineDateRunStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_pipelineRunId", ["pipelineRunId"])
    .index("by_ownerId_and_date", ["ownerId", "date"])
    .index("by_ownerId_and_date_and_mode", ["ownerId", "date", "mode"])
    .index("by_ownerId_and_status", ["ownerId", "status"]),

  brokerageConnections: defineTable({
    accountId: v.optional(v.string()),
    connectionError: v.optional(v.string()),
    createdAt: v.number(),
    label: v.optional(v.string()),
    lastFailedSyncAt: v.optional(v.number()),
    lastSuccessfulSyncAt: v.optional(v.number()),
    ownerId: v.string(),
    queryId: v.optional(v.string()),
    source: brokerageSourceValidator,
    status: brokerageConnectionStatusValidator,
    tokenExpiresAt: v.optional(v.number()),
    tokenLabel: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_source", ["ownerId", "source"])
    .index("by_ownerId_and_source_and_status", ["ownerId", "source", "status"])
    .index("by_source_and_status", ["source", "status"]),

  brokerageSyncRuns: defineTable({
    completedAt: v.optional(v.number()),
    connectionId: v.id("brokerageConnections"),
    errorMessage: v.optional(v.string()),
    importedTrades: v.number(),
    ownerId: v.string(),
    positionSnapshotCount: v.number(),
    queryId: v.string(),
    rawReportId: v.optional(v.id("brokerageRawReports")),
    reconciliationIssueCount: v.number(),
    referenceCode: v.optional(v.string()),
    reportDate: v.string(),
    reportType: brokerageSyncReportTypeValidator,
    requestedAt: v.number(),
    skippedDuplicateTrades: v.number(),
    source: brokerageSourceValidator,
    startedAt: v.optional(v.number()),
    status: brokerageSyncRunStatusValidator,
    updatedAt: v.number(),
  })
    .index("by_connectionId_and_reportType_and_reportDate_and_queryId", [
      "connectionId",
      "reportType",
      "reportDate",
      "queryId",
    ])
    .index("by_connectionId_and_status", ["connectionId", "status"])
    .index("by_ownerId_and_reportDate_and_reportType", [
      "ownerId",
      "reportDate",
      "reportType",
    ])
    .index("by_ownerId_and_startedAt", ["ownerId", "startedAt"])
    .index("by_ownerId_and_status", ["ownerId", "status"]),

  brokerageRawReports: defineTable({
    byteLength: v.number(),
    connectionId: v.id("brokerageConnections"),
    contentHash: v.string(),
    createdAt: v.number(),
    ownerId: v.string(),
    reportDate: v.string(),
    reportType: brokerageSyncReportTypeValidator,
    source: brokerageSourceValidator,
    storageId: v.id("_storage"),
    syncRunId: v.id("brokerageSyncRuns"),
  })
    .index("by_syncRunId", ["syncRunId"])
    .index("by_contentHash", ["contentHash"])
    .index("by_connectionId_and_reportDate_and_reportType", [
      "connectionId",
      "reportDate",
      "reportType",
    ])
    .index("by_ownerId_and_reportDate", ["ownerId", "reportDate"]),

  brokeragePositionSnapshots: defineTable({
    assetType: marketDataAssetTypeValidator,
    brokerageAccountId: v.string(),
    connectionId: v.id("brokerageConnections"),
    createdAt: v.number(),
    currency: v.optional(v.string()),
    marketValue: v.optional(v.number()),
    ownerId: v.string(),
    quantity: v.number(),
    reportDate: v.string(),
    syncRunId: v.id("brokerageSyncRuns"),
    ticker: v.string(),
  })
    .index("by_syncRunId", ["syncRunId"])
    .index("by_syncRunId_and_account_and_assetType_and_ticker_and_reportDate", [
      "syncRunId",
      "brokerageAccountId",
      "assetType",
      "ticker",
      "reportDate",
    ])
    .index("by_ownerId_and_account_and_assetType_and_ticker_and_reportDate", [
      "ownerId",
      "brokerageAccountId",
      "assetType",
      "ticker",
      "reportDate",
    ]),

  brokerageCashSnapshots: defineTable({
    brokerageAccountId: v.string(),
    cash: v.number(),
    connectionId: v.id("brokerageConnections"),
    createdAt: v.number(),
    currency: v.string(),
    ownerId: v.string(),
    reportDate: v.string(),
    syncRunId: v.id("brokerageSyncRuns"),
  })
    .index("by_syncRunId", ["syncRunId"])
    .index("by_syncRunId_and_account_and_currency_and_reportDate", [
      "syncRunId",
      "brokerageAccountId",
      "currency",
      "reportDate",
    ])
    .index("by_ownerId_and_account_and_currency_and_reportDate", [
      "ownerId",
      "brokerageAccountId",
      "currency",
      "reportDate",
    ]),

  brokerageReconciliationIssues: defineTable({
    actualQuantity: v.optional(v.number()),
    assetType: v.optional(marketDataAssetTypeValidator),
    brokerageAccountId: v.optional(v.string()),
    connectionId: v.id("brokerageConnections"),
    createdAt: v.number(),
    currency: v.optional(v.string()),
    expectedQuantity: v.optional(v.number()),
    issueType: brokerageReconciliationIssueTypeValidator,
    message: v.string(),
    ownerId: v.string(),
    reportDate: v.string(),
    resolvedAt: v.optional(v.number()),
    severity: brokerageReconciliationIssueSeverityValidator,
    status: brokerageReconciliationIssueStatusValidator,
    syncRunId: v.id("brokerageSyncRuns"),
    ticker: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_syncRunId", ["syncRunId"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_ownerId_and_status_and_reportDate", [
      "ownerId",
      "status",
      "reportDate",
    ])
    .index("by_owner_connection_reportDate_issueType_status", [
      "ownerId",
      "connectionId",
      "reportDate",
      "issueType",
      "status",
    ]),

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
    source: v.union(
      v.literal("ibkr"),
      v.literal("kraken"),
      v.literal("manual"),
    ),
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
    .index("by_owner_portfolioId_date", ["ownerId", "portfolioId", "date"])
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
    source: v.union(
      v.literal("ibkr"),
      v.literal("kraken"),
      v.literal("manual"),
    ),
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
