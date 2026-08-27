import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  getEasternDateString,
  getRecentBusinessDateRange,
} from "./lib/ibkrSchedule";
import { deriveOpenPositions } from "./lib/openPositions";
import { parseIbkrEasternTimestamp } from "../shared/brokerage/ibkr-flex/time";

const RECENT_BUSINESS_DAYS = 5;
const MAX_RECENT_FILLS_PER_TABLE = 250;
const MAX_POSITION_TRADES = 5_000;
const MAX_PENDING_FILLS = 100;
const MAX_RECENT_ACCEPTED_FILLS = 25;
const MAX_CHECK_INS_IN_RECENT_WINDOW = 100;
const MAX_SYNC_RUNS_TO_INSPECT = 100;
const MAX_NOTES_FOR_EXACT_COUNT = 5_000;
const MAX_RECONCILIATION_ISSUES = 500;
const MAX_BROKER_SNAPSHOT_ROWS = 1_000;
const MAX_MARKET_PRICE_ROWS_TO_INSPECT = 25;

const checkInWindowValidator = v.union(
  v.literal("late_morning"),
  v.literal("afternoon"),
  v.literal("end_of_day"),
);

const checkInKindValidator = v.union(
  v.literal("mirror"),
  v.literal("briefing"),
  v.literal("backfill"),
);

const assetTypeValidator = v.union(v.literal("crypto"), v.literal("stock"));
const sourceValidator = v.union(
  v.literal("ibkr"),
  v.literal("kraken"),
  v.literal("manual"),
);
const directionValidator = v.union(v.literal("long"), v.literal("short"));
const sideValidator = v.union(v.literal("buy"), v.literal("sell"));

const acceptedFillValidator = v.object({
  assetType: assetTypeValidator,
  date: v.number(),
  direction: directionValidator,
  id: v.string(),
  price: v.number(),
  quantity: v.number(),
  reviewStatus: v.literal("accepted"),
  side: sideValidator,
  source: sourceValidator,
  ticker: v.string(),
});

const pendingFillValidator = v.object({
  assetType: v.union(assetTypeValidator, v.null()),
  date: v.union(v.number(), v.null()),
  direction: v.union(directionValidator, v.null()),
  id: v.string(),
  price: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  reviewStatus: v.literal("pending_review"),
  side: v.union(sideValidator, v.null()),
  source: sourceValidator,
  ticker: v.union(v.string(), v.null()),
});

const fillValidator = v.union(acceptedFillValidator, pendingFillValidator);

const positionValidator = v.object({
  avgEntryPrice: v.number(),
  direction: directionValidator,
  netQuantity: v.number(),
  source: v.literal("derived_accepted_trades"),
  ticker: v.string(),
});

const noteValidator = v.object({
  chartUrls: v.union(v.array(v.string()), v.null()),
  content: v.string(),
  id: v.id("notes"),
  noteDate: v.number(),
  origin: v.union(v.literal("retrospective"), v.null()),
  ticker: v.union(v.string(), v.null()),
});

const notePageValidator = v.object({
  hasMore: v.boolean(),
  items: v.array(noteValidator),
  nextCursor: v.union(v.string(), v.null()),
});

const checkInHistoryValidator = v.object({
  checkInId: v.id("checkIns"),
  kind: checkInKindValidator,
  respondedAt: v.union(v.number(), v.null()),
  sentAt: v.number(),
  window: checkInWindowValidator,
});

const skippedOrderValidator = v.object({
  reason: v.string(),
  ticker: v.union(v.string(), v.null()),
});

const syncStatusValidator = v.union(
  v.null(),
  v.object({
    completedAt: v.union(v.number(), v.null()),
    errorMessage: v.union(v.string(), v.null()),
    importedTrades: v.number(),
    reconciliationIssueCount: v.number(),
    reportDate: v.string(),
    skippedDuplicateTrades: v.number(),
    skippedOrders: v.array(skippedOrderValidator),
    status: v.union(
      v.literal("queued"),
      v.literal("requesting"),
      v.literal("waiting_for_statement"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed_retryable"),
      v.literal("failed_terminal"),
    ),
    warnings: v.array(v.string()),
  }),
);

const reconciliationIssueValidator = v.object({
  actualQuantity: v.union(v.number(), v.null()),
  expectedQuantity: v.union(v.number(), v.null()),
  issueType: v.union(
    v.literal("position_mismatch"),
    v.literal("missing_local_position"),
    v.literal("missing_brokerage_position"),
    v.literal("cash_mismatch"),
    v.literal("pending_import_review"),
  ),
  message: v.string(),
  reportDate: v.string(),
  ticker: v.union(v.string(), v.null()),
});

const instrumentReconciliationIssueValidator = v.object({
  actualQuantity: v.union(v.number(), v.null()),
  expectedQuantity: v.union(v.number(), v.null()),
  issueType: v.union(
    v.literal("position_mismatch"),
    v.literal("missing_local_position"),
    v.literal("missing_brokerage_position"),
    v.literal("cash_mismatch"),
    v.literal("pending_import_review"),
  ),
  message: v.string(),
  reportDate: v.string(),
});

function easternMidnight(date: string): number {
  const timestamp = parseIbkrEasternTimestamp(
    `${date.replaceAll("-", "")};000000`,
  );
  if (timestamp === undefined) throw new Error(`Invalid Eastern date: ${date}`);
  return timestamp;
}

function nextCalendarDate(date: string): string {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString().slice(0, 10);
}

function trimRequiredContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Note content is required");
  return trimmed;
}

function normalizeOptionalTicker(
  ticker: string | undefined,
): string | undefined {
  const trimmed = ticker?.trim().toUpperCase();
  return trimmed ? trimmed : undefined;
}

function acceptedFillFromTrade(trade: Doc<"trades">) {
  return {
    assetType: trade.assetType,
    date: trade.date,
    direction: trade.direction,
    id: trade._id,
    price: trade.price,
    quantity: trade.quantity,
    reviewStatus: "accepted" as const,
    side: trade.side,
    source: trade.source ?? "manual",
    ticker: trade.ticker.toUpperCase(),
  };
}

function pendingFillFromInboxTrade(trade: Doc<"inboxTrades">) {
  return {
    assetType: trade.assetType ?? null,
    date: trade.date ?? null,
    direction: trade.direction ?? null,
    id: trade._id,
    price: trade.price ?? null,
    quantity: trade.quantity ?? null,
    reviewStatus: "pending_review" as const,
    side: trade.side ?? null,
    source: trade.source,
    ticker: trade.ticker?.toUpperCase() ?? null,
  };
}

function buildOpenPositions(trades: Doc<"trades">[]) {
  return deriveOpenPositions(trades).map((position) => ({
    avgEntryPrice: position.averageCost,
    direction: position.direction,
    netQuantity: position.quantity,
    source: "derived_accepted_trades" as const,
    ticker: position.ticker.toUpperCase(),
  }));
}

function noteFromDocument(note: Doc<"notes">) {
  return {
    chartUrls: note.chartUrls ?? null,
    content: note.content,
    id: note._id,
    noteDate: note.noteDate,
    origin: note.origin ?? null,
    ticker: note.ticker?.toUpperCase() ?? null,
  };
}

function reconciliationIssueFromDocument(
  issue: Doc<"brokerageReconciliationIssues">,
) {
  return {
    actualQuantity: issue.actualQuantity ?? null,
    expectedQuantity: issue.expectedQuantity ?? null,
    issueType: issue.issueType,
    message: issue.message,
    reportDate: issue.reportDate,
    ticker: issue.ticker?.toUpperCase() ?? null,
  };
}

function parseSkippedOrders(warnings: string[]) {
  const prefix = "Skipped IBKR Order ";
  return warnings.flatMap((warning) => {
    if (!warning.startsWith(prefix)) return [];
    const separatorIndex = warning.indexOf(": ", prefix.length);
    if (separatorIndex === -1) return [];
    const label = warning.slice(prefix.length, separatorIndex);
    const tickerMatch = /\(([^()]*)\)$/.exec(label);
    return [
      {
        reason: warning.slice(separatorIndex + 2),
        ticker: tickerMatch?.[1]?.trim().toUpperCase() || null,
      },
    ];
  });
}

function syncStatusFromRun(run: Doc<"brokerageSyncRuns"> | undefined) {
  if (!run) return null;
  const warnings = run.warnings ?? [];
  return {
    completedAt: run.completedAt ?? null,
    errorMessage: run.errorMessage ?? null,
    importedTrades: run.importedTrades,
    reconciliationIssueCount: run.reconciliationIssueCount,
    reportDate: run.reportDate,
    skippedDuplicateTrades: run.skippedDuplicateTrades,
    skippedOrders: parseSkippedOrders(warnings),
    status: run.status,
    warnings,
  };
}

async function getRecentActivityRuns(ctx: QueryCtx, ownerId: string) {
  const runs = await ctx.db
    .query("brokerageSyncRuns")
    .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(MAX_SYNC_RUNS_TO_INSPECT);
  return runs.filter((run) => run.reportType === "activity");
}

async function getLatestSuccessfulActivityRun(ctx: QueryCtx, ownerId: string) {
  const succeededRuns = await ctx.db
    .query("brokerageSyncRuns")
    .withIndex("by_ownerId_and_status_and_updatedAt", (q) =>
      q.eq("ownerId", ownerId).eq("status", "succeeded"),
    )
    .order("desc")
    .take(MAX_SYNC_RUNS_TO_INSPECT);
  return succeededRuns.find((run) => run.reportType === "activity");
}

async function getPositionTradesOrThrow(ctx: QueryCtx, ownerId: string) {
  const trades = await ctx.db
    .query("trades")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_POSITION_TRADES + 1);
  if (trades.length > MAX_POSITION_TRADES) {
    throw new Error(
      `Counterpart position calculation exceeds the ${MAX_POSITION_TRADES}-trade limit`,
    );
  }
  return trades;
}

async function getOpenReconciliationIssuesOrThrow(
  ctx: QueryCtx,
  ownerId: string,
) {
  const issues = await ctx.db
    .query("brokerageReconciliationIssues")
    .withIndex("by_ownerId_and_status_and_reportDate", (q) =>
      q.eq("ownerId", ownerId).eq("status", "open"),
    )
    .order("desc")
    .take(MAX_RECONCILIATION_ISSUES + 1);
  if (issues.length > MAX_RECONCILIATION_ISSUES) {
    throw new Error(
      `Counterpart reconciliation query exceeds the ${MAX_RECONCILIATION_ISSUES}-issue limit`,
    );
  }
  return issues;
}

async function getOwnerNotesForExactCountOrThrow(
  ctx: QueryCtx,
  ownerId: string,
) {
  const notes = await ctx.db
    .query("notes")
    .withIndex("by_owner_noteDate", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(MAX_NOTES_FOR_EXACT_COUNT + 1);
  if (notes.length > MAX_NOTES_FOR_EXACT_COUNT) {
    throw new Error(
      `Counterpart note count exceeds the ${MAX_NOTES_FOR_EXACT_COUNT}-note limit`,
    );
  }
  return notes;
}

async function areNoteIdsValidForOwner(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  noteIds: string[],
) {
  for (const noteId of noteIds) {
    const normalized = ctx.db.normalizeId("notes", noteId);
    if (!normalized) return false;
    const note = await ctx.db.get(normalized);
    if (!note || note.ownerId !== ownerId) return false;
  }
  return true;
}

function dateBounds(
  startDate: string | undefined,
  endDate: string | undefined,
) {
  return {
    endTimestamp: endDate
      ? easternMidnight(nextCalendarDate(endDate))
      : undefined,
    startTimestamp: startDate ? easternMidnight(startDate) : undefined,
  };
}

export const getDailyContext = internalQuery({
  args: { now: v.number(), ownerId: v.string() },
  returns: v.object({
    noteSummaries: v.array(
      v.object({
        latestNoteDate: v.union(v.number(), v.null()),
        noteCount: v.number(),
        ticker: v.string(),
      }),
    ),
    openPositions: v.array(positionValidator),
    syncStatus: syncStatusValidator,
    todayCheckIns: v.array(checkInHistoryValidator),
    undiscussedFills: v.array(fillValidator),
  }),
  handler: async (ctx, args) => {
    const { endDate, startDate } = getRecentBusinessDateRange(
      args.now,
      RECENT_BUSINESS_DAYS,
    );
    const startTimestamp = easternMidnight(startDate);
    const endTimestamp = easternMidnight(nextCalendarDate(endDate));
    const today = getEasternDateString(args.now);

    const [
      recentTrades,
      recentInboxTrades,
      positionTrades,
      recentCheckIns,
      todayCheckIns,
      activityRuns,
      ownerNotes,
    ] = await Promise.all([
      ctx.db
        .query("trades")
        .withIndex("by_owner_date", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .gte("date", startTimestamp)
            .lt("date", endTimestamp),
        )
        .order("desc")
        .take(MAX_RECENT_FILLS_PER_TABLE),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_date", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .gte("date", startTimestamp)
            .lt("date", endTimestamp),
        )
        .order("desc")
        .take(MAX_RECENT_FILLS_PER_TABLE),
      getPositionTradesOrThrow(ctx, args.ownerId),
      ctx.db
        .query("checkIns")
        .withIndex("by_owner_date", (q) =>
          q.eq("ownerId", args.ownerId).gte("date", startDate),
        )
        .take(MAX_CHECK_INS_IN_RECENT_WINDOW),
      ctx.db
        .query("checkIns")
        .withIndex("by_owner_date", (q) =>
          q.eq("ownerId", args.ownerId).eq("date", today),
        )
        .take(3),
      getRecentActivityRuns(ctx, args.ownerId),
      getOwnerNotesForExactCountOrThrow(ctx, args.ownerId),
    ]);

    const answeredFillIds = new Set(
      recentCheckIns
        .filter((checkIn) => checkIn.respondedAt !== undefined)
        .flatMap((checkIn) => checkIn.surfacedTradeIds ?? []),
    );
    const undiscussedFills = [
      ...recentTrades.map(acceptedFillFromTrade),
      ...recentInboxTrades.map(pendingFillFromInboxTrade),
    ]
      .filter((fill) => !answeredFillIds.has(fill.id))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    const openPositions = buildOpenPositions(positionTrades);
    const relevantTickers = new Set([
      ...undiscussedFills.flatMap((fill) => (fill.ticker ? [fill.ticker] : [])),
      ...openPositions.map((position) => position.ticker),
    ]);
    const summaryByTicker = new Map<
      string,
      { latestNoteDate: number | null; noteCount: number; ticker: string }
    >();
    for (const ticker of relevantTickers) {
      summaryByTicker.set(ticker, {
        latestNoteDate: null,
        noteCount: 0,
        ticker,
      });
    }
    for (const note of ownerNotes) {
      const ticker = note.ticker?.toUpperCase();
      if (!ticker || !relevantTickers.has(ticker)) continue;
      const existing = summaryByTicker.get(ticker)!;
      existing.latestNoteDate ??= note.noteDate;
      existing.noteCount += 1;
    }

    return {
      noteSummaries: [...summaryByTicker.values()].sort((a, b) =>
        a.ticker.localeCompare(b.ticker),
      ),
      openPositions,
      syncStatus: syncStatusFromRun(activityRuns[0]),
      todayCheckIns: todayCheckIns.map((checkIn) => ({
        checkInId: checkIn._id,
        kind: checkIn.kind,
        respondedAt: checkIn.respondedAt ?? null,
        sentAt: checkIn.sentAt,
        window: checkIn.window,
      })),
      undiscussedFills,
    };
  },
});

export const getInstrumentContext = internalQuery({
  args: {
    notesLimit: v.number(),
    now: v.number(),
    ownerId: v.string(),
    ticker: v.string(),
  },
  returns: v.object({
    brokerPositions: v.array(
      v.object({
        asOf: v.string(),
        brokerageAccountId: v.string(),
        currency: v.union(v.string(), v.null()),
        marketValue: v.union(v.number(), v.null()),
        quantity: v.number(),
      }),
    ),
    derivedPosition: v.union(positionValidator, v.null()),
    latestPrice: v.union(
      v.object({ close: v.number(), date: v.string() }),
      v.null(),
    ),
    notes: notePageValidator.extend({ totalCount: v.number() }),
    openReconciliationIssues: v.array(instrumentReconciliationIssueValidator),
    pendingFills: v.object({
      cap: v.number(),
      items: v.array(pendingFillValidator),
      truncated: v.boolean(),
    }),
    recentAcceptedFills: v.array(acceptedFillValidator),
    ticker: v.string(),
  }),
  handler: async (ctx, args) => {
    const ticker = args.ticker.trim().toUpperCase();
    const [
      positionTrades,
      acceptedTrades,
      pendingTrades,
      notesPage,
      tickerNotes,
      latestSuccessfulActivityRun,
      openIssues,
      stockInstrument,
      cryptoInstrument,
    ] = await Promise.all([
      getPositionTradesOrThrow(ctx, args.ownerId),
      ctx.db
        .query("trades")
        .withIndex("by_owner_date", (q) => q.eq("ownerId", args.ownerId))
        .filter((q) => q.eq(q.field("ticker"), ticker))
        .order("desc")
        .take(MAX_RECENT_ACCEPTED_FILLS),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status_ticker", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("status", "pending_review")
            .eq("ticker", ticker),
        )
        .take(MAX_PENDING_FILLS + 1),
      ctx.db
        .query("notes")
        .withIndex("by_owner_ticker_noteDate", (q) =>
          q.eq("ownerId", args.ownerId).eq("ticker", ticker),
        )
        .order("desc")
        .paginate({ cursor: null, numItems: args.notesLimit }),
      ctx.db
        .query("notes")
        .withIndex("by_owner_ticker_noteDate", (q) =>
          q.eq("ownerId", args.ownerId).eq("ticker", ticker),
        )
        .take(MAX_NOTES_FOR_EXACT_COUNT + 1),
      getLatestSuccessfulActivityRun(ctx, args.ownerId),
      getOpenReconciliationIssuesOrThrow(ctx, args.ownerId),
      ctx.db
        .query("marketDataInstruments")
        .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("assetType", "stock")
            .eq("symbol", ticker),
        )
        .unique(),
      ctx.db
        .query("marketDataInstruments")
        .withIndex("by_ownerId_and_assetType_and_symbol", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("assetType", "crypto")
            .eq("symbol", ticker),
        )
        .unique(),
    ]);

    if (tickerNotes.length > MAX_NOTES_FOR_EXACT_COUNT) {
      throw new Error(
        `Counterpart ticker note count exceeds the ${MAX_NOTES_FOR_EXACT_COUNT}-note limit`,
      );
    }

    const openPositions = buildOpenPositions(positionTrades);
    const derivedPosition =
      openPositions.find((position) => position.ticker === ticker) ?? null;
    const pendingItems = pendingTrades.slice(0, MAX_PENDING_FILLS);
    const matchingIssues = openIssues
      .filter((issue) => issue.ticker?.toUpperCase() === ticker)
      .map((issue) => ({
        actualQuantity: issue.actualQuantity ?? null,
        expectedQuantity: issue.expectedQuantity ?? null,
        issueType: issue.issueType,
        message: issue.message,
        reportDate: issue.reportDate,
      }));

    let brokerPositions: Array<{
      asOf: string;
      brokerageAccountId: string;
      currency: string | null;
      marketValue: number | null;
      quantity: number;
    }> = [];
    if (latestSuccessfulActivityRun) {
      const rows = await ctx.db
        .query("brokeragePositionSnapshots")
        .withIndex("by_syncRunId", (q) =>
          q.eq("syncRunId", latestSuccessfulActivityRun._id),
        )
        .filter((q) => q.eq(q.field("ticker"), ticker))
        .take(MAX_BROKER_SNAPSHOT_ROWS + 1);
      if (rows.length > MAX_BROKER_SNAPSHOT_ROWS) {
        throw new Error(
          `Counterpart broker position query exceeds the ${MAX_BROKER_SNAPSHOT_ROWS}-row limit`,
        );
      }
      brokerPositions = rows
        .map((row) => ({
          asOf: row.reportDate,
          brokerageAccountId: row.brokerageAccountId,
          currency: row.currency ?? null,
          marketValue: row.marketValue ?? null,
          quantity: row.quantity,
        }))
        .sort((a, b) =>
          a.brokerageAccountId.localeCompare(b.brokerageAccountId),
        );
    }

    const instrument = stockInstrument ?? cryptoInstrument;
    let latestPrice: { close: number; date: string } | null = null;
    if (instrument?.providerSymbol) {
      const snapshots = await ctx.db
        .query("marketPriceSnapshots")
        .withIndex("by_provider_and_providerSymbol_and_date", (q) =>
          q
            .eq("provider", instrument.provider)
            .eq("providerSymbol", instrument.providerSymbol!),
        )
        .order("desc")
        .take(MAX_MARKET_PRICE_ROWS_TO_INSPECT);
      const snapshot = snapshots.find(
        (row) => row.status === "ok" && row.close !== undefined,
      );
      if (snapshot?.close !== undefined) {
        latestPrice = { close: snapshot.close, date: snapshot.date };
      }
    }

    return {
      brokerPositions,
      derivedPosition,
      latestPrice,
      notes: {
        hasMore: !notesPage.isDone,
        items: notesPage.page.map(noteFromDocument),
        nextCursor: notesPage.isDone ? null : notesPage.continueCursor,
        totalCount: tickerNotes.length,
      },
      openReconciliationIssues: matchingIssues,
      pendingFills: {
        cap: MAX_PENDING_FILLS,
        items: pendingItems.map(pendingFillFromInboxTrade),
        truncated: pendingTrades.length > MAX_PENDING_FILLS,
      },
      recentAcceptedFills: acceptedTrades.map(acceptedFillFromTrade),
      ticker,
    };
  },
});

export const listNotes = internalQuery({
  args: {
    endDate: v.optional(v.string()),
    generalOnly: v.optional(v.boolean()),
    origin: v.optional(v.literal("retrospective")),
    ownerId: v.string(),
    paginationOpts: paginationOptsValidator,
    startDate: v.optional(v.string()),
    ticker: v.optional(v.string()),
  },
  returns: notePageValidator,
  handler: async (ctx, args) => {
    const ticker = normalizeOptionalTicker(args.ticker);
    const { endTimestamp, startTimestamp } = dateBounds(
      args.startDate,
      args.endDate,
    );

    const page = ticker
      ? await ctx.db
          .query("notes")
          .withIndex("by_owner_ticker_noteDate", (q) => {
            const ownerTicker = q
              .eq("ownerId", args.ownerId)
              .eq("ticker", ticker);
            if (startTimestamp !== undefined && endTimestamp !== undefined) {
              return ownerTicker
                .gte("noteDate", startTimestamp)
                .lt("noteDate", endTimestamp);
            }
            if (startTimestamp !== undefined) {
              return ownerTicker.gte("noteDate", startTimestamp);
            }
            if (endTimestamp !== undefined) {
              return ownerTicker.lt("noteDate", endTimestamp);
            }
            return ownerTicker;
          })
          .filter((q) =>
            args.origin
              ? q.eq(q.field("origin"), args.origin)
              : q.eq(q.field("ownerId"), args.ownerId),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("notes")
          .withIndex("by_owner_noteDate", (q) => {
            const owner = q.eq("ownerId", args.ownerId);
            if (startTimestamp !== undefined && endTimestamp !== undefined) {
              return owner
                .gte("noteDate", startTimestamp)
                .lt("noteDate", endTimestamp);
            }
            if (startTimestamp !== undefined) {
              return owner.gte("noteDate", startTimestamp);
            }
            if (endTimestamp !== undefined) {
              return owner.lt("noteDate", endTimestamp);
            }
            return owner;
          })
          .filter((q) => {
            if (args.generalOnly && args.origin) {
              return q.and(
                q.eq(q.field("ticker"), undefined),
                q.eq(q.field("origin"), args.origin),
              );
            }
            if (args.generalOnly) {
              return q.eq(q.field("ticker"), undefined);
            }
            if (args.origin) {
              return q.eq(q.field("origin"), args.origin);
            }
            return q.eq(q.field("ownerId"), args.ownerId);
          })
          .order("desc")
          .paginate(args.paginationOpts);

    return {
      hasMore: !page.isDone,
      items: page.page.map(noteFromDocument),
      nextCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export const listFills = internalQuery({
  args: {
    endDate: v.optional(v.string()),
    ownerId: v.string(),
    paginationOpts: paginationOptsValidator,
    startDate: v.optional(v.string()),
    ticker: v.optional(v.string()),
  },
  returns: v.object({
    accepted: v.object({
      hasMore: v.boolean(),
      items: v.array(acceptedFillValidator),
      nextCursor: v.union(v.string(), v.null()),
    }),
    pending: v.object({
      cap: v.number(),
      items: v.array(pendingFillValidator),
      truncated: v.boolean(),
    }),
  }),
  handler: async (ctx, args) => {
    const ticker = normalizeOptionalTicker(args.ticker);
    const { endTimestamp, startTimestamp } = dateBounds(
      args.startDate,
      args.endDate,
    );

    const acceptedPage = await ctx.db
      .query("trades")
      .withIndex("by_owner_date", (q) => {
        const owner = q.eq("ownerId", args.ownerId);
        if (startTimestamp !== undefined && endTimestamp !== undefined) {
          return owner.gte("date", startTimestamp).lt("date", endTimestamp);
        }
        if (startTimestamp !== undefined)
          return owner.gte("date", startTimestamp);
        if (endTimestamp !== undefined) return owner.lt("date", endTimestamp);
        return owner;
      })
      .filter((q) =>
        ticker
          ? q.eq(q.field("ticker"), ticker)
          : q.eq(q.field("ownerId"), args.ownerId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const pendingRows = await ctx.db
      .query("inboxTrades")
      .withIndex("by_owner_date", (q) => {
        const owner = q.eq("ownerId", args.ownerId);
        if (startTimestamp !== undefined && endTimestamp !== undefined) {
          return owner.gte("date", startTimestamp).lt("date", endTimestamp);
        }
        if (startTimestamp !== undefined)
          return owner.gte("date", startTimestamp);
        if (endTimestamp !== undefined) return owner.lt("date", endTimestamp);
        return owner;
      })
      .filter((q) =>
        ticker
          ? q.eq(q.field("ticker"), ticker)
          : q.eq(q.field("status"), "pending_review"),
      )
      .order("desc")
      .take(MAX_PENDING_FILLS + 1);

    return {
      accepted: {
        hasMore: !acceptedPage.isDone,
        items: acceptedPage.page.map(acceptedFillFromTrade),
        nextCursor: acceptedPage.isDone ? null : acceptedPage.continueCursor,
      },
      pending: {
        cap: MAX_PENDING_FILLS,
        items: pendingRows
          .slice(0, MAX_PENDING_FILLS)
          .map(pendingFillFromInboxTrade),
        truncated: pendingRows.length > MAX_PENDING_FILLS,
      },
    };
  },
});

export const getStrategyContext = internalQuery({
  args: { ownerId: v.string() },
  returns: v.object({
    strategyDoc: v.union(
      v.object({ content: v.string(), updatedAt: v.number() }),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("strategyDoc")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .take(2);
    if (docs.length > 1) {
      throw new Error(
        `Invariant violated: expected at most one strategyDoc for owner ${args.ownerId}`,
      );
    }
    return {
      strategyDoc: docs[0]
        ? { content: docs[0].content, updatedAt: docs[0].updatedAt }
        : null,
    };
  },
});

export const getPortfolioContext = internalQuery({
  args: { now: v.number(), ownerId: v.string() },
  returns: v.object({
    broker: v.union(
      v.object({
        asOf: v.string(),
        cash: v.array(
          v.object({
            amount: v.number(),
            currency: v.string(),
            rowKind: v.union(v.literal("base_summary"), v.literal("currency")),
          }),
        ),
        positions: v.array(
          v.object({
            assetType: assetTypeValidator,
            brokerageAccountId: v.string(),
            currency: v.union(v.string(), v.null()),
            marketValue: v.union(v.number(), v.null()),
            quantity: v.number(),
            ticker: v.string(),
          }),
        ),
      }),
      v.null(),
    ),
    derived: v.object({
      computedAt: v.number(),
      positions: v.array(positionValidator),
    }),
    pendingInbox: v.object({
      byTicker: v.array(v.object({ count: v.number(), ticker: v.string() })),
      total: v.number(),
    }),
    reconciliation: v.array(reconciliationIssueValidator),
    syncStatus: syncStatusValidator,
  }),
  handler: async (ctx, args) => {
    const [
      positionTrades,
      pendingRows,
      openIssues,
      activityRuns,
      latestSuccessfulActivityRun,
    ] = await Promise.all([
      getPositionTradesOrThrow(ctx, args.ownerId),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", args.ownerId).eq("status", "pending_review"),
        )
        .take(MAX_POSITION_TRADES + 1),
      getOpenReconciliationIssuesOrThrow(ctx, args.ownerId),
      getRecentActivityRuns(ctx, args.ownerId),
      getLatestSuccessfulActivityRun(ctx, args.ownerId),
    ]);
    if (pendingRows.length > MAX_POSITION_TRADES) {
      throw new Error(
        `Counterpart pending inbox count exceeds the ${MAX_POSITION_TRADES}-row limit`,
      );
    }

    const pendingByTicker = new Map<string, number>();
    for (const row of pendingRows) {
      const ticker = row.ticker?.toUpperCase();
      if (!ticker) continue;
      pendingByTicker.set(ticker, (pendingByTicker.get(ticker) ?? 0) + 1);
    }

    let broker: {
      asOf: string;
      cash: Array<{
        amount: number;
        currency: string;
        rowKind: "base_summary" | "currency";
      }>;
      positions: Array<{
        assetType: "crypto" | "stock";
        brokerageAccountId: string;
        currency: string | null;
        marketValue: number | null;
        quantity: number;
        ticker: string;
      }>;
    } | null = null;
    if (latestSuccessfulActivityRun) {
      const [positionRows, cashRows] = await Promise.all([
        ctx.db
          .query("brokeragePositionSnapshots")
          .withIndex("by_syncRunId", (q) =>
            q.eq("syncRunId", latestSuccessfulActivityRun._id),
          )
          .take(MAX_BROKER_SNAPSHOT_ROWS + 1),
        ctx.db
          .query("brokerageCashSnapshots")
          .withIndex("by_syncRunId", (q) =>
            q.eq("syncRunId", latestSuccessfulActivityRun._id),
          )
          .take(MAX_BROKER_SNAPSHOT_ROWS + 1),
      ]);
      if (
        positionRows.length > MAX_BROKER_SNAPSHOT_ROWS ||
        cashRows.length > MAX_BROKER_SNAPSHOT_ROWS
      ) {
        throw new Error(
          `Counterpart broker snapshot exceeds the ${MAX_BROKER_SNAPSHOT_ROWS}-row limit`,
        );
      }
      broker = {
        asOf: latestSuccessfulActivityRun.reportDate,
        cash: cashRows.map((row) => ({
          amount: row.cash,
          currency: row.currency,
          rowKind: row.rowKind,
        })),
        positions: positionRows.map((row) => ({
          assetType: row.assetType,
          brokerageAccountId: row.brokerageAccountId,
          currency: row.currency ?? null,
          marketValue: row.marketValue ?? null,
          quantity: row.quantity,
          ticker: row.ticker.toUpperCase(),
        })),
      };
    }

    return {
      broker,
      derived: {
        computedAt: args.now,
        positions: buildOpenPositions(positionTrades),
      },
      pendingInbox: {
        byTicker: [...pendingByTicker.entries()]
          .map(([ticker, count]) => ({ count, ticker }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker)),
        total: pendingRows.length,
      },
      reconciliation: openIssues.map(reconciliationIssueFromDocument),
      syncStatus: syncStatusFromRun(activityRuns[0]),
    };
  },
});

export const addNote = internalMutation({
  args: {
    content: v.string(),
    noteDate: v.number(),
    ownerId: v.string(),
    ticker: v.optional(v.string()),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notes", {
      content: trimRequiredContent(args.content),
      noteDate: args.noteDate,
      ownerId: args.ownerId,
      ticker: normalizeOptionalTicker(args.ticker),
    });
  },
});

export const areNoteIdsValid = internalQuery({
  args: { noteIds: v.array(v.string()), ownerId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await areNoteIdsValidForOwner(ctx, args.ownerId, args.noteIds);
  },
});

export const createCheckIn = internalMutation({
  args: {
    date: v.string(),
    kind: checkInKindValidator,
    ownerId: v.string(),
    surfacedTradeIds: v.optional(v.array(v.string())),
    window: checkInWindowValidator,
  },
  returns: v.object({
    checkInId: v.id("checkIns"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const sameDayCheckIns = await ctx.db
      .query("checkIns")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", args.ownerId).eq("date", args.date),
      )
      .take(4);
    const existing = sameDayCheckIns.find(
      (checkIn) => checkIn.window === args.window,
    );
    if (existing) return { checkInId: existing._id, created: false };

    const checkInId = await ctx.db.insert("checkIns", {
      date: args.date,
      kind: args.kind,
      ownerId: args.ownerId,
      sentAt: Date.now(),
      surfacedTradeIds: args.surfacedTradeIds,
      window: args.window,
    });
    return { checkInId, created: true };
  },
});

const recordCheckInResponseResultValidator = v.union(
  v.literal("recorded"),
  v.literal("not_found"),
  v.literal("invalid_note_ids"),
);

export const recordCheckInResponse = internalMutation({
  args: {
    checkInId: v.string(),
    noteIds: v.optional(v.array(v.string())),
    ownerId: v.string(),
    respondedAt: v.number(),
  },
  returns: recordCheckInResponseResultValidator,
  handler: async (ctx, args) => {
    const normalizedCheckInId = ctx.db.normalizeId("checkIns", args.checkInId);
    if (!normalizedCheckInId) return "not_found";
    const checkIn = await ctx.db.get(normalizedCheckInId);
    if (!checkIn || checkIn.ownerId !== args.ownerId) return "not_found";

    if (
      args.noteIds &&
      !(await areNoteIdsValidForOwner(ctx, args.ownerId, args.noteIds))
    ) {
      return "invalid_note_ids";
    }
    const noteIds = (args.noteIds ?? []).map((noteId) =>
      ctx.db.normalizeId("notes", noteId),
    ) as Id<"notes">[];
    await ctx.db.patch(checkIn._id, {
      noteIds: [...new Set([...(checkIn.noteIds ?? []), ...noteIds])],
      respondedAt: checkIn.respondedAt ?? args.respondedAt,
    });
    return "recorded";
  },
});
