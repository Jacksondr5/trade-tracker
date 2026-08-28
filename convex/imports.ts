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
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { resolveInstrumentForOwner } from "./marketData";
import { validateInboxTradeCandidate } from "../shared/imports/validation";
import { KRAKEN_DEFAULT_ACCOUNT_ID } from "../shared/imports/constants";
import {
  classifyIbkrExternalId,
  ibkrLogicalFillFingerprint,
} from "./lib/ibkrTradeIdentity";
import { findMatchingTradePlans } from "../shared/imports/auto-match";
import {
  deriveInstrumentPositionEpisodes,
  MAX_DERIVED_POSITION_TRADES,
} from "./lib/openPositions";

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

const MAX_COUNTERPART_HISTORY_SCAN = MAX_DERIVED_POSITION_TRADES;

export type EpisodeTradeEvidence = {
  _creationTime: number;
  date: number;
  direction: "long" | "short";
  portfolioId?: Id<"portfolios">;
  portfolioName?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  ticker: string;
  tradeId: Id<"trades">;
};

export function acceptedHistoryAtOrBeforeFill<T extends { date: number }>(
  history: T[],
  fillDate: number,
): T[] {
  return history.filter((trade) => trade.date <= fillDate);
}

type PortfolioInferenceEvidence = {
  date: number;
  portfolioId: Id<"portfolios">;
  portfolioName: string;
  tradeId: Id<"trades">;
};

export type PortfolioInferenceResult =
  | {
      kind: "inferred";
      groupOpeningTradeDate: number;
      inheritedFromTrade: PortfolioInferenceEvidence;
      openPositionSignedQuantity: number;
      portfolioId: Id<"portfolios">;
      portfolioName: string;
    }
  | {
      kind: "needsPortfolio";
      reason:
        | "opening_trade"
        | "implausible_history"
        | "history_scan_limit"
        | "open_episode_portfolio_missing"
        | "open_episode_portfolio_conflict";
    };

/**
 * Inherit only inside a plausible open flat-to-flat episode. This is Phase 3's
 * episode concept computed on demand; it deliberately persists no episode ID.
 */
export function inferPortfolioFromOpenEpisode(
  trades: EpisodeTradeEvidence[],
): PortfolioInferenceResult {
  const firstTrade = trades[0];
  if (firstTrade === undefined) {
    return { kind: "needsPortfolio", reason: "opening_trade" };
  }
  const position = deriveInstrumentPositionEpisodes(trades).get(
    `${firstTrade.ticker.toUpperCase()}:${firstTrade.direction}`,
  );
  if (position === undefined) {
    return { kind: "needsPortfolio", reason: "opening_trade" };
  }
  if (!position.isPlausible) {
    return { kind: "needsPortfolio", reason: "implausible_history" };
  }
  if (position.netQuantity === 0 || position.openingTrade === null) {
    return { kind: "needsPortfolio", reason: "opening_trade" };
  }
  const openingIndex = position.orderedTrades.indexOf(position.openingTrade);
  const openEpisode = position.orderedTrades.slice(openingIndex);
  const latest = openEpisode[openEpisode.length - 1]!;
  if (latest.portfolioId === undefined || latest.portfolioName === undefined) {
    return {
      kind: "needsPortfolio",
      reason: "open_episode_portfolio_missing",
    };
  }
  if (
    openEpisode.some(
      (trade) =>
        trade.portfolioId !== undefined &&
        trade.portfolioId !== latest.portfolioId,
    )
  ) {
    return {
      kind: "needsPortfolio",
      reason: "open_episode_portfolio_conflict",
    };
  }
  const signedQuantity =
    latest.direction === "long" ? position.netQuantity : -position.netQuantity;
  return {
    groupOpeningTradeDate: position.openingTrade.date,
    inheritedFromTrade: {
      date: latest.date,
      portfolioId: latest.portfolioId,
      portfolioName: latest.portfolioName,
      tradeId: latest.tradeId,
    },
    kind: "inferred",
    openPositionSignedQuantity: signedQuantity,
    portfolioId: latest.portfolioId,
    portfolioName: latest.portfolioName,
  };
}

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
    candidateCount: v.number(),
    suggestedTradePlans: v.array(openTradePlanReferenceValidator),
    ticker: v.union(v.string(), v.null()),
  }),
  matchState: v.union(
    v.literal("ambiguous"),
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

export type StageInboxTradeInput = {
  assetType?: "stock" | "crypto";
  brokerageAccountId?: string;
  date?: number;
  direction?: "long" | "short";
  externalId?: string;
  fees?: number;
  orderType?: string;
  portfolioId?: Id<"portfolios">;
  price?: number;
  quantity?: number;
  side?: "buy" | "sell";
  source: ImportSource;
  taxes?: number;
  ticker?: string;
  validationErrors?: string[];
  validationWarnings?: string[];
};

export type StageInboxTradesResult = {
  imported: number;
  skippedDuplicates: number;
  skippedLogicalDuplicates: number;
  withValidationErrors: number;
  withWarnings: number;
};

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
    }
  | { ok: false; error: string };

async function checkInboxTradeForAcceptance(
  ctx: MutationCtx,
  ownerId: string,
  inboxTradeId: Id<"inboxTrades">,
  args: {
    portfolioId?: Id<"portfolios">;
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

  const portfolioId =
    args.portfolioId !== undefined ? args.portfolioId : inboxTrade.portfolioId;

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
  });

  await ctx.db.delete(args.inboxTrade._id);

  return { accepted: true };
}

export async function stageInboxTradesForOwner(
  ctx: MutationCtx,
  ownerId: string,
  trades: StageInboxTradeInput[],
): Promise<StageInboxTradesResult> {
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
  const existingIbkrLogicalFills = new Map<
    string,
    Set<ReturnType<typeof classifyIbkrExternalId>>
  >();
  for (const existingTrade of [
    ...existingTrades,
    ...existingPendingInboxTrades,
  ]) {
    const fingerprint = ibkrLogicalFillFingerprint(existingTrade);
    if (fingerprint === null || existingTrade.externalId === undefined)
      continue;
    const kinds = existingIbkrLogicalFills.get(fingerprint) ?? new Set();
    kinds.add(classifyIbkrExternalId(existingTrade.externalId));
    existingIbkrLogicalFills.set(fingerprint, kinds);
  }

  let imported = 0;
  let skippedDuplicates = 0;
  let skippedLogicalDuplicates = 0;
  let withValidationErrors = 0;
  let withWarnings = 0;
  const scheduledResolutionKeys = new Set<string>();

  const portfolioOwnerCache = new Map<Id<"portfolios">, true>();

  for (const trade of trades) {
    const brokerageAccountId = normalizeBrokerageAccountId(
      trade.source,
      trade.brokerageAccountId,
    );

    const logicalFillFingerprint = ibkrLogicalFillFingerprint({
      ...trade,
      brokerageAccountId,
    });
    const externalIdKind = classifyIbkrExternalId(trade.externalId);

    if (trade.externalId) {
      const key = dedupKey(trade.source, trade.externalId);
      if (existingExternalIds.has(key)) {
        skippedDuplicates++;
        continue;
      }
      existingExternalIds.add(key);
    }
    if (
      logicalFillFingerprint !== null &&
      trade.externalId !== undefined &&
      existingIbkrLogicalFills.has(logicalFillFingerprint) &&
      !existingIbkrLogicalFills.get(logicalFillFingerprint)!.has(externalIdKind)
    ) {
      const matchedExternalIdKinds = [
        ...existingIbkrLogicalFills.get(logicalFillFingerprint)!,
      ].sort();
      existingIbkrLogicalFills.get(logicalFillFingerprint)!.add(externalIdKind);
      console.warn(
        "ibkr_logical_duplicate_skipped",
        JSON.stringify({
          date: trade.date,
          direction: trade.direction,
          incomingExternalId: trade.externalId,
          incomingExternalIdKind: externalIdKind,
          matchedExternalIdKinds,
          price: trade.price,
          quantity: trade.quantity,
          side: trade.side,
          ticker: trade.ticker,
        }),
      );
      skippedDuplicates++;
      skippedLogicalDuplicates++;
      continue;
    }
    if (logicalFillFingerprint !== null && trade.externalId !== undefined) {
      const kinds =
        existingIbkrLogicalFills.get(logicalFillFingerprint) ?? new Set();
      kinds.add(externalIdKind);
      existingIbkrLogicalFills.set(logicalFillFingerprint, kinds);
    }

    const validation = validateInboxTradeCandidate(trade, {
      includeExisting: false,
    });
    const validationErrors = [
      ...new Set([
        ...(trade.validationErrors ?? []),
        ...validation.validationErrors,
      ]),
    ];
    const validationWarnings = [
      ...new Set([
        ...(trade.validationWarnings ?? []),
        ...validation.validationWarnings,
      ]),
    ];

    if (validationErrors.length > 0) withValidationErrors++;
    if (validationWarnings.length > 0) withWarnings++;

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
      validationErrors,
      validationWarnings,
    });

    imported++;
  }

  return {
    imported,
    skippedDuplicates,
    skippedLogicalDuplicates,
    withValidationErrors,
    withWarnings,
  };
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
        validationErrors: v.optional(v.array(v.string())),
        validationWarnings: v.optional(v.array(v.string())),
      }),
    ),
  },
  returns: v.object({
    imported: v.number(),
    skippedDuplicates: v.number(),
    skippedLogicalDuplicates: v.number(),
    withValidationErrors: v.number(),
    withWarnings: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    return await stageInboxTradesForOwner(ctx, ownerId, args.trades);
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

        const matchState: "ambiguous" | "suggested" | "unmatched" =
          matchedPlans.length === 1
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
      matchType: v.literal("suggested"),
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
    const suggested = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status_ticker", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("status", "pending_review")
          .eq("ticker", normalizedSymbol),
      )
      .collect();
    const sortedSuggested = suggested.sort(
      (a, b) => (b.date ?? b._creationTime) - (a.date ?? a._creationTime),
    );

    return [
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
  },
  returns: acceptCheckValidator,
  handler: async (ctx, args): Promise<AcceptCheckResult> => {
    const result = await checkInboxTradeForAcceptance(
      ctx,
      args.ownerId,
      args.inboxTradeId,
      {
        portfolioId: args.portfolioId,
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
    };
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

const portfolioInferenceEvidenceValidator = v.object({
  date: v.number(),
  portfolioId: v.id("portfolios"),
  portfolioName: v.string(),
  tradeId: v.id("trades"),
});

const counterpartTradeSummaryValidator = v.object({
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  inboxTradeId: v.id("inboxTrades"),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  ticker: v.string(),
});

const prepareCounterpartAcceptanceValidator = v.union(
  v.object({
    kind: v.literal("ready"),
    portfolio: v.object({
      evidence: v.object({
        groupOpeningTradeDate: v.union(v.number(), v.null()),
        inheritedFromTrade: v.union(
          portfolioInferenceEvidenceValidator,
          v.null(),
        ),
        openPositionSignedQuantity: v.union(v.number(), v.null()),
      }),
      id: v.id("portfolios"),
      name: v.string(),
      reason: v.union(
        v.literal("explicit_override"),
        v.literal("open_episode_inheritance"),
      ),
    }),
    trade: counterpartTradeSummaryValidator,
  }),
  v.object({
    kind: v.literal("needsPortfolio"),
    candidates: v.array(
      v.object({
        evidence: v.array(portfolioInferenceEvidenceValidator),
        evidenceCount: v.number(),
        mostRecentTradeDate: v.number(),
        portfolioId: v.id("portfolios"),
        portfolioName: v.string(),
      }),
    ),
    reason: v.union(
      v.literal("opening_trade"),
      v.literal("implausible_history"),
      v.literal("history_scan_limit"),
      v.literal("open_episode_portfolio_missing"),
      v.literal("open_episode_portfolio_conflict"),
    ),
    trade: counterpartTradeSummaryValidator,
  }),
  v.object({
    kind: v.literal("outOfOrder"),
    conflict: v.union(
      v.object({
        kind: v.literal("older_pending"),
        date: v.number(),
        inboxTradeId: v.id("inboxTrades"),
        ticker: v.string(),
      }),
      v.object({
        kind: v.literal("newer_accepted"),
        date: v.number(),
        ticker: v.string(),
        tradeId: v.id("trades"),
      }),
    ),
    trade: counterpartTradeSummaryValidator,
  }),
  v.object({
    code: v.union(
      v.literal("CONFLICT"),
      v.literal("NOT_FOUND"),
      v.literal("VALIDATION"),
    ),
    error: v.string(),
    kind: v.literal("error"),
  }),
);

const counterpartAcceptanceFingerprintValidator = v.object({
  portfolio: v.object({
    groupOpeningTradeDate: v.union(v.number(), v.null()),
    inheritedFromTradeId: v.union(v.id("trades"), v.null()),
    openPositionSignedQuantity: v.union(v.number(), v.null()),
    portfolioId: v.id("portfolios"),
    reason: v.union(
      v.literal("explicit_override"),
      v.literal("open_episode_inheritance"),
    ),
  }),
  trade: counterpartTradeSummaryValidator,
});

const counterpartAcceptanceContextValidator = v.object({
  expected: counterpartAcceptanceFingerprintValidator,
  portfolioIdOverride: v.optional(v.id("portfolios")),
});

type PrepareCounterpartAcceptance =
  | {
      kind: "ready";
      portfolio: {
        evidence: {
          groupOpeningTradeDate: number | null;
          inheritedFromTrade: PortfolioInferenceEvidence | null;
          openPositionSignedQuantity: number | null;
        };
        id: Id<"portfolios">;
        name: string;
        reason: "explicit_override" | "open_episode_inheritance";
      };
      trade: {
        date: number;
        direction: "long" | "short";
        inboxTradeId: Id<"inboxTrades">;
        price: number;
        quantity: number;
        side: "buy" | "sell";
        ticker: string;
      };
    }
  | {
      kind: "needsPortfolio";
      candidates: Array<{
        evidence: PortfolioInferenceEvidence[];
        evidenceCount: number;
        mostRecentTradeDate: number;
        portfolioId: Id<"portfolios">;
        portfolioName: string;
      }>;
      reason: Extract<
        PortfolioInferenceResult,
        { kind: "needsPortfolio" }
      >["reason"];
      trade: {
        date: number;
        direction: "long" | "short";
        inboxTradeId: Id<"inboxTrades">;
        price: number;
        quantity: number;
        side: "buy" | "sell";
        ticker: string;
      };
    }
  | {
      kind: "outOfOrder";
      conflict:
        | {
            kind: "older_pending";
            date: number;
            inboxTradeId: Id<"inboxTrades">;
            ticker: string;
          }
        | {
            kind: "newer_accepted";
            date: number;
            ticker: string;
            tradeId: Id<"trades">;
          };
      trade: {
        date: number;
        direction: "long" | "short";
        inboxTradeId: Id<"inboxTrades">;
        price: number;
        quantity: number;
        side: "buy" | "sell";
        ticker: string;
      };
    }
  | {
      code: "CONFLICT" | "NOT_FOUND" | "VALIDATION";
      error: string;
      kind: "error";
    };

type CounterpartAcceptanceFingerprint = {
  portfolio: {
    groupOpeningTradeDate: number | null;
    inheritedFromTradeId: Id<"trades"> | null;
    openPositionSignedQuantity: number | null;
    portfolioId: Id<"portfolios">;
    reason: "explicit_override" | "open_episode_inheritance";
  };
  trade: Extract<PrepareCounterpartAcceptance, { kind: "ready" }>["trade"];
};

type CounterpartAcceptanceContext = {
  expected: CounterpartAcceptanceFingerprint;
  portfolioIdOverride?: Id<"portfolios">;
};

function counterpartAcceptanceFingerprint(
  prepared: Extract<PrepareCounterpartAcceptance, { kind: "ready" }>,
): CounterpartAcceptanceFingerprint {
  return {
    portfolio: {
      groupOpeningTradeDate: prepared.portfolio.evidence.groupOpeningTradeDate,
      inheritedFromTradeId:
        prepared.portfolio.evidence.inheritedFromTrade?.tradeId ?? null,
      openPositionSignedQuantity:
        prepared.portfolio.evidence.openPositionSignedQuantity,
      portfolioId: prepared.portfolio.id,
      reason: prepared.portfolio.reason,
    },
    trade: prepared.trade,
  };
}

function counterpartAcceptanceFingerprintsMatch(
  left: CounterpartAcceptanceFingerprint,
  right: CounterpartAcceptanceFingerprint,
): boolean {
  return (
    left.portfolio.groupOpeningTradeDate ===
      right.portfolio.groupOpeningTradeDate &&
    left.portfolio.inheritedFromTradeId ===
      right.portfolio.inheritedFromTradeId &&
    left.portfolio.openPositionSignedQuantity ===
      right.portfolio.openPositionSignedQuantity &&
    left.portfolio.portfolioId === right.portfolio.portfolioId &&
    left.portfolio.reason === right.portfolio.reason &&
    left.trade.date === right.trade.date &&
    left.trade.direction === right.trade.direction &&
    left.trade.inboxTradeId === right.trade.inboxTradeId &&
    left.trade.price === right.trade.price &&
    left.trade.quantity === right.trade.quantity &&
    left.trade.side === right.trade.side &&
    left.trade.ticker === right.trade.ticker
  );
}

async function prepareCounterpartAcceptanceForOwner(
  ctx: QueryCtx | MutationCtx,
  args: {
    inboxTradeId: string;
    ownerId: string;
    portfolioId?: string;
  },
): Promise<PrepareCounterpartAcceptance> {
  const inboxTradeId = ctx.db.normalizeId("inboxTrades", args.inboxTradeId);
  if (inboxTradeId === null) {
    return {
      code: "VALIDATION",
      error: "inboxTradeId must be a valid inboxTrades document ID",
      kind: "error",
    };
  }
  const inboxTrade = await ctx.db.get(inboxTradeId);
  if (inboxTrade === null || inboxTrade.ownerId !== args.ownerId) {
    return {
      code: "NOT_FOUND",
      error: "Inbox trade not found",
      kind: "error",
    };
  }
  const validation = validateInboxTradeCandidate(inboxTrade, {
    includeExisting: false,
  });
  if (validation.validationErrors.length > 0) {
    return {
      code: "VALIDATION",
      error: validation.validationErrors.join("; "),
      kind: "error",
    };
  }
  const trade = {
    date: inboxTrade.date!,
    direction: inboxTrade.direction!,
    inboxTradeId: inboxTrade._id,
    price: inboxTrade.price!,
    quantity: inboxTrade.quantity!,
    side: inboxTrade.side!,
    ticker: validation.normalizedTicker!,
  };
  let explicitPortfolio: Doc<"portfolios"> | null = null;
  if (args.portfolioId !== undefined) {
    const portfolioId = ctx.db.normalizeId("portfolios", args.portfolioId);
    if (portfolioId === null) {
      return {
        code: "VALIDATION",
        error: "portfolioId must be a valid portfolios document ID",
        kind: "error",
      };
    }
    explicitPortfolio = await ctx.db.get(portfolioId);
    if (
      explicitPortfolio === null ||
      explicitPortfolio.ownerId !== args.ownerId
    ) {
      return {
        code: "NOT_FOUND",
        error: "Portfolio not found",
        kind: "error",
      };
    }
  }

  const normalizedAccountId = normalizeBrokerageAccountId(
    inboxTrade.source,
    inboxTrade.brokerageAccountId,
  );
  const [pendingSameTicker, history] = await Promise.all([
    ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_status_ticker_date", (q) =>
        q
          .eq("ownerId", args.ownerId)
          .eq("status", "pending_review")
          .eq("ticker", trade.ticker),
      )
      .order("asc")
      .take(MAX_COUNTERPART_HISTORY_SCAN + 1),
    ctx.db
      .query("trades")
      .withIndex("by_owner_ticker_date", (q) =>
        q.eq("ownerId", args.ownerId).eq("ticker", trade.ticker),
      )
      .order("asc")
      .take(MAX_COUNTERPART_HISTORY_SCAN + 1),
  ]);

  const olderTrade = pendingSameTicker.find(
    (item) =>
      item._id !== inboxTrade._id &&
      item.source === inboxTrade.source &&
      normalizeBrokerageAccountId(item.source, item.brokerageAccountId) ===
        normalizedAccountId &&
      item.date !== undefined &&
      (item.date < trade.date ||
        (item.date === trade.date &&
          item._creationTime < inboxTrade._creationTime)),
  );
  if (olderTrade?.date !== undefined) {
    return {
      conflict: {
        date: olderTrade.date,
        inboxTradeId: olderTrade._id,
        kind: "older_pending",
        ticker: trade.ticker,
      },
      kind: "outOfOrder",
      trade,
    };
  }

  const historyWasTruncated = history.length > MAX_COUNTERPART_HISTORY_SCAN;
  const boundedHistory = history
    .slice(0, MAX_COUNTERPART_HISTORY_SCAN)
    .filter((item) => item.ticker.toUpperCase() === trade.ticker);
  const newerAcceptedTrade = boundedHistory.find(
    (acceptedTrade) => acceptedTrade.date > trade.date,
  );
  if (newerAcceptedTrade !== undefined) {
    return {
      conflict: {
        date: newerAcceptedTrade.date,
        kind: "newer_accepted",
        ticker: trade.ticker,
        tradeId: newerAcceptedTrade._id,
      },
      kind: "outOfOrder",
      trade,
    };
  }
  if (historyWasTruncated && args.portfolioId !== undefined) {
    return {
      code: "CONFLICT",
      error: "Accepted history exceeds the safe ordering limit",
      kind: "error",
    };
  }

  if (explicitPortfolio !== null) {
    return {
      kind: "ready",
      portfolio: {
        evidence: {
          groupOpeningTradeDate: null,
          inheritedFromTrade: null,
          openPositionSignedQuantity: null,
        },
        id: explicitPortfolio._id,
        name: explicitPortfolio.name,
        reason: "explicit_override",
      },
      trade,
    };
  }

  const acceptedHistory = acceptedHistoryAtOrBeforeFill(
    boundedHistory,
    trade.date,
  );
  const portfolios = new Map<Id<"portfolios">, string>();
  for (const item of acceptedHistory) {
    if (item.portfolioId === undefined || portfolios.has(item.portfolioId)) {
      continue;
    }
    const portfolio = await ctx.db.get(item.portfolioId);
    if (portfolio !== null && portfolio.ownerId === args.ownerId) {
      portfolios.set(item.portfolioId, portfolio.name);
    }
  }
  const chronologicalHistory: EpisodeTradeEvidence[] = acceptedHistory
    .filter((item) => item.direction === trade.direction)
    .map((item) => ({
      _creationTime: item._creationTime,
      date: item.date,
      direction: item.direction,
      portfolioId: item.portfolioId,
      portfolioName:
        item.portfolioId === undefined
          ? undefined
          : portfolios.get(item.portfolioId),
      price: item.price,
      quantity: item.quantity,
      side: item.side,
      ticker: item.ticker,
      tradeId: item._id,
    }));
  const inference: PortfolioInferenceResult = historyWasTruncated
    ? { kind: "needsPortfolio", reason: "history_scan_limit" }
    : inferPortfolioFromOpenEpisode(chronologicalHistory);
  if (inference.kind === "needsPortfolio") {
    const candidateEvidence = [...acceptedHistory].reverse().flatMap((item) => {
      if (item.portfolioId === undefined) return [];
      const portfolioName = portfolios.get(item.portfolioId);
      if (portfolioName === undefined) return [];
      return [
        {
          date: item.date,
          portfolioId: item.portfolioId,
          portfolioName,
          tradeId: item._id,
        },
      ];
    });
    const byPortfolio = new Map<
      Id<"portfolios">,
      PortfolioInferenceEvidence[]
    >();
    for (const item of candidateEvidence) {
      const items = byPortfolio.get(item.portfolioId) ?? [];
      items.push(item);
      byPortfolio.set(item.portfolioId, items);
    }
    const candidates = [...byPortfolio.entries()].map(
      ([portfolioId, evidence]) => ({
        evidence,
        evidenceCount: evidence.length,
        mostRecentTradeDate: evidence[0].date,
        portfolioId,
        portfolioName: evidence[0].portfolioName,
      }),
    );
    return { candidates, ...inference, trade };
  }
  return {
    kind: "ready",
    portfolio: {
      evidence: {
        groupOpeningTradeDate: inference.groupOpeningTradeDate,
        inheritedFromTrade: inference.inheritedFromTrade,
        openPositionSignedQuantity: inference.openPositionSignedQuantity,
      },
      id: inference.portfolioId,
      name: inference.portfolioName,
      reason: "open_episode_inheritance",
    },
    trade,
  };
}

export const prepareCounterpartAcceptance = internalQuery({
  args: {
    inboxTradeId: v.string(),
    ownerId: v.string(),
    portfolioId: v.optional(v.string()),
  },
  returns: prepareCounterpartAcceptanceValidator,
  handler: prepareCounterpartAcceptanceForOwner,
});

export const commitInboxTradeAcceptanceInternal = internalMutation({
  args: {
    counterpartContext: v.optional(counterpartAcceptanceContextValidator),
    inboxTradeId: v.id("inboxTrades"),
    instrumentId: v.id("marketDataInstruments"),
    ownerId: v.string(),
    portfolioId: v.optional(v.id("portfolios")),
  },
  returns: v.object({
    accepted: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    if (args.counterpartContext !== undefined) {
      const prepared = await prepareCounterpartAcceptanceForOwner(ctx, {
        inboxTradeId: args.inboxTradeId,
        ownerId: args.ownerId,
        portfolioId: args.counterpartContext.portfolioIdOverride,
      });
      if (prepared.kind !== "ready") {
        return {
          accepted: false,
          error: "Acceptance context changed; refresh before retrying",
        };
      }
      const actualFingerprint = counterpartAcceptanceFingerprint(prepared);
      if (
        !counterpartAcceptanceFingerprintsMatch(
          actualFingerprint,
          args.counterpartContext.expected,
        )
      ) {
        return {
          accepted: false,
          error: "Acceptance context changed; refresh before retrying",
        };
      }
    }

    const checkResult = await checkInboxTradeForAcceptance(
      ctx,
      args.ownerId,
      args.inboxTradeId,
      {
        portfolioId: args.portfolioId,
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
    });
  },
});

export async function acceptCounterpartTradeViaAction(
  ctx: ActionCtx,
  ownerId: string,
  args: {
    inboxTradeId: string;
    portfolioId?: string;
  },
) {
  const prepared: PrepareCounterpartAcceptance = await ctx.runQuery(
    internal.imports.prepareCounterpartAcceptance,
    { ...args, ownerId },
  );
  if (prepared.kind !== "ready") return prepared;

  const result = await acceptInboxTradeViaAction(
    ctx,
    ownerId,
    prepared.trade.inboxTradeId,
    {
      counterpartContext: {
        expected: counterpartAcceptanceFingerprint(prepared),
        portfolioIdOverride:
          prepared.portfolio.reason === "explicit_override"
            ? prepared.portfolio.id
            : undefined,
      },
      portfolioId: prepared.portfolio.id,
    },
  );
  if (!result.accepted) {
    return {
      code: result.error?.startsWith("Acceptance context changed")
        ? ("CONFLICT" as const)
        : ("VALIDATION" as const),
      error: result.error ?? "Trade could not be accepted",
      kind: "error" as const,
    };
  }
  return {
    kind: "accepted" as const,
    portfolio: prepared.portfolio,
    trade: prepared.trade,
  };
}

export async function acceptInboxTradeViaAction(
  ctx: import("./_generated/server").ActionCtx,
  ownerId: string,
  inboxTradeId: Id<"inboxTrades">,
  args: {
    counterpartContext?: CounterpartAcceptanceContext;
    portfolioId?: Id<"portfolios">;
  },
): Promise<{ accepted: boolean; error?: string }> {
  const check: AcceptCheckResult = await ctx.runMutation(
    internal.imports.checkInboxTradeForAcceptanceInternal,
    {
      inboxTradeId,
      ownerId,
      portfolioId: args.portfolioId,
    },
  );
  if (!check.ok) {
    return { accepted: false, error: check.error };
  }

  const resolution = await resolveInstrumentForOwner(ctx, ownerId, {
    assetType: check.assetType,
    ticker: check.candidate.ticker,
  });
  if (resolution.status !== "resolved" && resolution.status !== "ignored") {
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
      counterpartContext: args.counterpartContext,
      portfolioId: check.portfolioId,
    },
  );
  return result;
}

export const acceptTrade = action({
  args: {
    inboxTradeId: v.id("inboxTrades"),
    portfolioId: v.optional(v.id("portfolios")),
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
