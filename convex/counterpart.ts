import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  getEasternDateString,
  getRecentBusinessDateRange,
} from "./lib/ibkrSchedule";
import { deriveOpenPositions } from "./lib/openPositions";
import { parseIbkrEasternTimestamp } from "../shared/brokerage/ibkr-flex/time";

const RECENT_BUSINESS_DAYS = 5;
const MAX_RECENT_FILLS_PER_TABLE = 250;
const MAX_POSITION_TRADES = 5_000;
const MAX_CHECK_INS_IN_RECENT_WINDOW = 100;
const MAX_NOTES_PER_TICKER = 3;

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

const fillValidator = v.object({
  date: v.union(v.number(), v.null()),
  id: v.string(),
  price: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
  reviewStatus: v.union(v.literal("accepted"), v.literal("pending_review")),
  side: v.union(v.literal("buy"), v.literal("sell"), v.null()),
  source: v.union(v.literal("ibkr"), v.literal("kraken"), v.literal("manual")),
  table: v.union(v.literal("trades"), v.literal("inboxTrades")),
  ticker: v.union(v.string(), v.null()),
});

const positionValidator = v.object({
  averageCost: v.number(),
  bare: v.boolean(),
  direction: v.union(v.literal("long"), v.literal("short")),
  quantity: v.number(),
  ticker: v.string(),
});

const noteExhaustValidator = v.object({
  content: v.string(),
  id: v.id("notes"),
  noteDate: v.number(),
  ticker: v.string(),
});

const checkInHistoryValidator = v.object({
  kind: checkInKindValidator,
  respondedAt: v.union(v.number(), v.null()),
  sentAt: v.number(),
  window: checkInWindowValidator,
});

const syncStatusValidator = v.union(
  v.null(),
  v.object({
    completedAt: v.union(v.number(), v.null()),
    errorMessage: v.union(v.string(), v.null()),
    reportDate: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("requesting"),
      v.literal("waiting_for_statement"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed_retryable"),
      v.literal("failed_terminal"),
    ),
    updatedAt: v.number(),
  }),
);

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

function previousCalendarDate(date: string): string {
  const cursor = new Date(`${date}T12:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

function trimRequiredContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Note content is required");
  return trimmed;
}

function trimOptionalTicker(ticker: string | undefined): string | undefined {
  const trimmed = ticker?.trim();
  return trimmed ? trimmed : undefined;
}

function fillFromTrade(trade: Doc<"trades">) {
  return {
    date: trade.date,
    id: trade._id,
    price: trade.price,
    quantity: trade.quantity,
    reviewStatus: "accepted" as const,
    side: trade.side,
    source: trade.source ?? "manual",
    table: "trades" as const,
    ticker: trade.ticker,
  };
}

function fillFromInboxTrade(trade: Doc<"inboxTrades">) {
  return {
    date: trade.date ?? null,
    id: trade._id,
    price: trade.price ?? null,
    quantity: trade.quantity ?? null,
    reviewStatus: "pending_review" as const,
    side: trade.side ?? null,
    source: trade.source,
    table: "inboxTrades" as const,
    ticker: trade.ticker ?? null,
  };
}

function buildOpenPositions(trades: Doc<"trades">[]) {
  return deriveOpenPositions(trades).map(({ hasTradePlan, ...position }) => ({
    ...position,
    bare: !hasTradePlan,
  }));
}

export const getDailyContext = internalQuery({
  args: { ownerId: v.string() },
  returns: v.object({
    openPositions: v.array(positionValidator),
    recentNotes: v.array(noteExhaustValidator),
    syncStatus: syncStatusValidator,
    todayCheckIns: v.array(checkInHistoryValidator),
    undiscussedFills: v.array(fillValidator),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { endDate, startDate } = getRecentBusinessDateRange(
      now,
      RECENT_BUSINESS_DAYS,
    );
    const startTimestamp = easternMidnight(startDate);
    const endTimestamp = easternMidnight(nextCalendarDate(endDate));
    const today = getEasternDateString(now);

    const [
      recentTrades,
      recentInboxTrades,
      positionTrades,
      recentCheckIns,
      todayCheckIns,
      syncRuns,
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
      ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_POSITION_TRADES + 1),
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
      ctx.db
        .query("brokerageSyncRuns")
        .withIndex("by_ownerId_and_startedAt", (q) =>
          q.eq("ownerId", args.ownerId),
        )
        .order("desc")
        .take(25),
    ]);

    if (positionTrades.length > MAX_POSITION_TRADES) {
      throw new Error(
        `Counterpart position calculation exceeds the ${MAX_POSITION_TRADES}-trade limit`,
      );
    }

    const answeredFillIds = new Set(
      recentCheckIns
        .filter((checkIn) => checkIn.respondedAt !== undefined)
        .flatMap((checkIn) => checkIn.surfacedTradeIds ?? []),
    );
    const undiscussedFills = [
      ...recentTrades.map(fillFromTrade),
      ...recentInboxTrades.map(fillFromInboxTrade),
    ]
      .filter((fill) => !answeredFillIds.has(fill.id))
      .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
    const openPositions = buildOpenPositions(positionTrades);
    const relevantTickers = new Set([
      ...undiscussedFills.flatMap((fill) => (fill.ticker ? [fill.ticker] : [])),
      ...openPositions.map((position) => position.ticker),
    ]);
    const notesByTicker = await Promise.all(
      [...relevantTickers].map(async (ticker) => {
        const notes = await ctx.db
          .query("notes")
          .withIndex("by_owner_ticker", (q) =>
            q.eq("ownerId", args.ownerId).eq("ticker", ticker),
          )
          .order("desc")
          .take(MAX_NOTES_PER_TICKER);
        return notes.map((note) => ({
          content: note.content,
          id: note._id,
          noteDate: note.noteDate,
          ticker,
        }));
      }),
    );
    const latestActivityRun = syncRuns.find(
      (run) => run.reportType === "activity",
    );

    return {
      openPositions,
      recentNotes: notesByTicker.flat(),
      syncStatus: latestActivityRun
        ? {
            completedAt: latestActivityRun.completedAt ?? null,
            errorMessage: latestActivityRun.errorMessage ?? null,
            reportDate: latestActivityRun.reportDate,
            status: latestActivityRun.status,
            updatedAt: latestActivityRun.updatedAt,
          }
        : null,
      todayCheckIns: todayCheckIns.map((checkIn) => ({
        kind: checkIn.kind,
        respondedAt: checkIn.respondedAt ?? null,
        sentAt: checkIn.sentAt,
        window: checkIn.window,
      })),
      undiscussedFills,
    };
  },
});

export const addNote = internalMutation({
  args: {
    content: v.string(),
    noteDate: v.optional(v.number()),
    ownerId: v.string(),
    ticker: v.optional(v.string()),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notes", {
      content: trimRequiredContent(args.content),
      noteDate: args.noteDate ?? Date.now(),
      ownerId: args.ownerId,
      ticker: trimOptionalTicker(args.ticker),
    });
  },
});

export const areNoteIdsValid = internalQuery({
  args: { noteIds: v.array(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return args.noteIds.every(
      (noteId) => ctx.db.normalizeId("notes", noteId) !== null,
    );
  },
});

export const logCheckIn = internalMutation({
  args: {
    kind: checkInKindValidator,
    noteIds: v.optional(v.array(v.id("notes"))),
    ownerId: v.string(),
    respondedAt: v.optional(v.number()),
    surfacedTradeIds: v.optional(v.array(v.string())),
    window: checkInWindowValidator,
  },
  returns: v.id("checkIns"),
  handler: async (ctx, args) => {
    const date = getEasternDateString(Date.now());
    const sameDayCheckIns = await ctx.db
      .query("checkIns")
      .withIndex("by_owner_date", (q) =>
        q.eq("ownerId", args.ownerId).eq("date", date),
      )
      .take(3);
    let existing = sameDayCheckIns.find(
      (checkIn) => checkIn.window === args.window,
    );
    if (!existing && args.respondedAt !== undefined) {
      const priorDayCheckIns = await ctx.db
        .query("checkIns")
        .withIndex("by_owner_date", (q) =>
          q.eq("ownerId", args.ownerId).eq("date", previousCalendarDate(date)),
        )
        .take(3);
      const priorWindowCheckIns = priorDayCheckIns.filter(
        (checkIn) => checkIn.window === args.window,
      );
      existing =
        priorWindowCheckIns.find(
          (checkIn) => checkIn.respondedAt === undefined,
        ) ?? priorWindowCheckIns[0];
    }
    if (!existing) {
      return await ctx.db.insert("checkIns", {
        date,
        kind: args.kind,
        noteIds: args.noteIds,
        ownerId: args.ownerId,
        respondedAt: args.respondedAt,
        sentAt: Date.now(),
        surfacedTradeIds: args.surfacedTradeIds,
        window: args.window,
      });
    }

    await ctx.db.patch(existing._id, {
      kind: args.kind,
      noteIds: args.noteIds ?? existing.noteIds,
      respondedAt: args.respondedAt ?? existing.respondedAt,
      surfacedTradeIds: args.surfacedTradeIds ?? existing.surfacedTradeIds,
    });
    return existing._id;
  },
});
