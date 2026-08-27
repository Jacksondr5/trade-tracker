// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import {
  validateAddNoteBody,
  validateCreateCheckInBody,
  validateListFillsBody,
  validateListNotesBody,
} from "./http";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ownerId = "owner-a";
const otherOwnerId = "owner-b";
const now = Date.UTC(2026, 4, 15, 16, 0, 0); // Friday, noon Eastern.

describe("counterpart service surface", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    t = convexTest(schema, modules);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.COUNTERPART_TOKEN;
    delete process.env.COUNTERPART_OWNER_ID;
  });

  async function seedRecentFills() {
    return await t.run(async (ctx) => {
      const accepted = await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 4, 14, 15, 0, 0),
        direction: "long",
        ownerId,
        price: 100,
        quantity: 2,
        side: "buy",
        source: "ibkr",
        ticker: "AAPL",
      });
      const pending = await ctx.db.insert("inboxTrades", {
        date: Date.UTC(2026, 4, 14, 16, 0, 0),
        ownerId,
        source: "ibkr",
        status: "pending_review",
        validationErrors: ["ticker is required"],
        validationWarnings: ["No Orders section found"],
      });
      await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 4, 8, 15, 0, 0),
        direction: "long",
        ownerId,
        price: 10,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker: "OLD",
      });
      return { accepted, pending };
    });
  }

  async function post(path: string, body: unknown, token?: string) {
    return await t.fetch(path, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      method: "POST",
    });
  }

  it("resurfaces unanswered fills and excludes only fills on an answered check-in", async () => {
    const { accepted, pending } = await seedRecentFills();
    const noteDate = Date.UTC(2026, 4, 14, 18, 0, 0);
    const noteId = await t.mutation(internal.counterpart.addNote, {
      content: "  AAPL entry was a starter position.  ",
      noteDate,
      ownerId,
      ticker: " aapl ",
    });

    const initial = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(initial.undiscussedFills.map((fill) => fill.id)).toEqual(
      expect.arrayContaining([accepted, pending]),
    );
    expect(initial.undiscussedFills.map((fill) => fill.ticker)).not.toContain(
      "OLD",
    );
    expect(initial.undiscussedFills).toContainEqual({
      assetType: null,
      date: Date.UTC(2026, 4, 14, 16, 0, 0),
      direction: null,
      id: pending,
      price: null,
      quantity: null,
      reviewStatus: "pending_review",
      side: null,
      source: "ibkr",
      ticker: null,
    });
    expect(initial.openPositions).toEqual(
      expect.arrayContaining([
        {
          avgEntryPrice: 100,
          direction: "long",
          netQuantity: 2,
          source: "derived_accepted_trades",
          ticker: "AAPL",
        },
      ]),
    );
    expect(initial.openPositions[0]).not.toHaveProperty("bare");
    expect(initial.openPositions[0]).not.toHaveProperty("hasTradePlan");
    expect(initial.noteSummaries).toEqual([
      { latestNoteDate: noteDate, noteCount: 1, ticker: "AAPL" },
      { latestNoteDate: null, noteCount: 0, ticker: "OLD" },
    ]);

    const created = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [accepted, pending],
      window: "late_morning",
    });
    expect(created.created).toBe(true);
    const sent = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(sent.undiscussedFills.map((fill) => fill.id)).toEqual(
      expect.arrayContaining([accepted, pending]),
    );
    expect(sent.todayCheckIns).toEqual([
      expect.objectContaining({
        checkInId: created.checkInId,
        respondedAt: null,
        window: "late_morning",
      }),
    ]);

    const recordResult = await t.mutation(
      internal.counterpart.recordCheckInResponse,
      {
        checkInId: created.checkInId,
        noteIds: [noteId],
        ownerId,
        respondedAt: now + 60_000,
      },
    );
    expect(recordResult).toBe("recorded");

    const answered = await t.query(internal.counterpart.getDailyContext, {
      now: now + 60_000,
      ownerId,
    });
    expect(answered.undiscussedFills).toEqual([]);
    expect(answered.todayCheckIns).toEqual([
      expect.objectContaining({
        checkInId: created.checkInId,
        respondedAt: now + 60_000,
      }),
    ]);
  });

  it("denies every route when either server credential is missing", async () => {
    const routes = [
      ["daily-context", {}],
      ["instrument-context", { ticker: "AAPL" }],
      ["list-notes", {}],
      ["list-fills", {}],
      ["strategy-context", {}],
      ["portfolio-context", {}],
      ["get-check-in", { checkInId: "missing" }],
      ["add-note", { content: "note", noteDate: now }],
      [
        "create-check-in",
        {
          date: "2026-05-15",
          kind: "mirror",
          window: "late_morning",
        },
      ],
      ["confirm-check-in-delivery", { checkInId: "missing", deliveredAt: now }],
      ["record-check-in-response", { checkInId: "missing", respondedAt: now }],
    ] as const;

    for (const [route, body] of routes) {
      const missingToken = await post(`/internal/counterpart/${route}`, body);
      expect(missingToken.status).toBe(401);
      expect(await missingToken.json()).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized",
          retryable: false,
        },
        ok: false,
      });
    }

    process.env.COUNTERPART_TOKEN = "counterpart-only";
    for (const [route, body] of routes) {
      const missingOwner = await post(
        `/internal/counterpart/${route}`,
        body,
        "counterpart-only",
      );
      expect(missingOwner.status).toBe(401);
    }
  });

  it("uses the success/error envelope and rejects body ownerId as unknown", async () => {
    process.env.COUNTERPART_TOKEN = "counterpart-only";
    process.env.COUNTERPART_OWNER_ID = ownerId;

    const invalid = await post(
      "/internal/counterpart/daily-context",
      { ownerId },
      "counterpart-only",
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Unknown field: ownerId",
        retryable: false,
      },
      ok: false,
    });

    const valid = await post(
      "/internal/counterpart/daily-context",
      {},
      "counterpart-only",
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({
      data: expect.objectContaining({
        noteSummaries: [],
        openPositions: [],
        undiscussedFills: [],
      }),
      ok: true,
    });
  });

  it("validates pagination, dates, unknown fields, and mutually exclusive note filters", () => {
    expect(() =>
      validateListNotesBody({ generalOnly: true, ticker: "aapl" }),
    ).toThrow("mutually exclusive");
    expect(() => validateListNotesBody({ limit: 101 })).toThrow(
      "limit must be an integer from 1 to 100",
    );
    expect(() =>
      validateListFillsBody({
        endDate: "2026-05-14",
        startDate: "2026-05-15",
      }),
    ).toThrow("startDate must be on or before endDate");
    expect(() => validateListFillsBody({ ownerId })).toThrow(
      "Unknown field: ownerId",
    );
    expect(() =>
      validateAddNoteBody({ content: "note", noteDate: "today" }),
    ).toThrow("noteDate must be a number");
    expect(() =>
      validateCreateCheckInBody({
        date: "2026-02-31",
        kind: "mirror",
        window: "late_morning",
      }),
    ).toThrow("date must be a valid calendar date");
  });

  it("orders and paginates notes by noteDate, including general retrospective notes", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("notes", {
        content: "newest inserted first",
        noteDate: 300,
        ownerId,
        ticker: "AAPL",
      });
      await ctx.db.insert("notes", {
        content: "oldest inserted second",
        noteDate: 100,
        ownerId,
        ticker: "AAPL",
      });
      await ctx.db.insert("notes", {
        content: "middle inserted third",
        noteDate: 200,
        ownerId,
        ticker: "AAPL",
      });
      await ctx.db.insert("notes", {
        content: "converted retrospective",
        noteDate: 250,
        origin: "retrospective",
        ownerId,
      });
      await ctx.db.insert("notes", {
        content: "ordinary general note",
        noteDate: 225,
        ownerId,
      });
      await ctx.db.insert("notes", {
        content: "other owner",
        noteDate: 400,
        ownerId: otherOwnerId,
        ticker: "AAPL",
      });
    });

    const firstPage = await t.query(internal.counterpart.listNotes, {
      ownerId,
      paginationOpts: { cursor: null, numItems: 2 },
      ticker: "aapl",
    });
    expect(firstPage.items.map((note) => note.noteDate)).toEqual([300, 200]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await t.query(internal.counterpart.listNotes, {
      ownerId,
      paginationOpts: { cursor: firstPage.nextCursor, numItems: 2 },
      ticker: "AAPL",
    });
    expect(secondPage.items.map((note) => note.noteDate)).toEqual([100]);
    expect(secondPage).toMatchObject({ hasMore: false, nextCursor: null });

    const generalRetrospectives = await t.query(
      internal.counterpart.listNotes,
      {
        generalOnly: true,
        origin: "retrospective",
        ownerId,
        paginationOpts: { cursor: null, numItems: 25 },
      },
    );
    expect(generalRetrospectives.items).toEqual([
      expect.objectContaining({
        content: "converted retrospective",
        origin: "retrospective",
        ticker: null,
      }),
    ]);

    const allGeneralNotes = await t.query(internal.counterpart.listNotes, {
      generalOnly: true,
      ownerId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    expect(allGeneralNotes.items.map((note) => note.content)).toEqual([
      "converted retrospective",
      "ordinary general note",
    ]);
  });

  it("treats endDate as inclusive for notes and accepted and pending fills", async () => {
    const endOfEndDate = Date.UTC(2026, 4, 15, 3, 59, 59);
    const startOfNextDate = Date.UTC(2026, 4, 15, 4, 0, 0);
    await t.run(async (ctx) => {
      for (const [content, noteDate] of [
        ["included note", endOfEndDate],
        ["excluded note", startOfNextDate],
      ] as const) {
        await ctx.db.insert("notes", { content, noteDate, ownerId });
      }
      for (const [ticker, date] of [
        ["INCLUDED", endOfEndDate],
        ["EXCLUDED", startOfNextDate],
      ] as const) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          date,
          direction: "long",
          ownerId,
          price: 10,
          quantity: 1,
          side: "buy",
          ticker,
        });
        await ctx.db.insert("inboxTrades", {
          assetType: "stock",
          date,
          direction: "long",
          ownerId,
          price: 10,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          status: "pending_review",
          ticker,
          validationErrors: [],
          validationWarnings: [],
        });
      }
      await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "ibkr",
        status: "pending_review",
        ticker: "UNDATED",
        validationErrors: ["date is required"],
        validationWarnings: [],
      });
    });

    const notes = await t.query(internal.counterpart.listNotes, {
      endDate: "2026-05-14",
      ownerId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    expect(notes.items.map((note) => note.content)).toEqual(["included note"]);

    const fills = await t.query(internal.counterpart.listFills, {
      endDate: "2026-05-14",
      ownerId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    expect(fills.accepted.items.map((fill) => fill.ticker)).toEqual([
      "INCLUDED",
    ]);
    expect(fills.pending.items.map((fill) => fill.ticker)).toEqual([
      "INCLUDED",
    ]);

    const unbounded = await t.query(internal.counterpart.listFills, {
      ownerId,
      paginationOpts: { cursor: null, numItems: 25 },
    });
    expect(unbounded.pending.items.map((fill) => fill.ticker)).toContain(
      "UNDATED",
    );
  });

  it("surfaces undated pending fills last until a response discusses them", async () => {
    const { datedId, undatedId } = await t.run(async (ctx) => {
      const datedId = await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        date: Date.UTC(2026, 4, 14, 16, 0, 0),
        direction: "long",
        ownerId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: "DATED",
        validationErrors: [],
        validationWarnings: [],
      });
      const undatedId = await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "ibkr",
        status: "pending_review",
        ticker: "UNDATED",
        validationErrors: ["date is required"],
        validationWarnings: [],
      });
      return { datedId, undatedId };
    });

    const initial = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(initial.undiscussedFills.map((fill) => fill.id)).toEqual([
      datedId,
      undatedId,
    ]);
    expect(initial.undiscussedFills[1]).toMatchObject({
      date: null,
      ticker: "UNDATED",
    });

    const created = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [undatedId],
      window: "late_morning",
    });
    await t.mutation(internal.counterpart.recordCheckInResponse, {
      checkInId: created.checkInId,
      ownerId,
      respondedAt: now,
    });

    const answered = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(answered.undiscussedFills.map((fill) => fill.id)).toEqual([datedId]);
  });

  it("separates accepted pagination from the bounded pending snapshot", async () => {
    await t.run(async (ctx) => {
      for (const [date, ticker] of [
        [300, "AAPL"],
        [200, "AAPL"],
        [100, "MSFT"],
      ] as const) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          date,
          direction: "long",
          ownerId,
          price: 10,
          quantity: 1,
          side: "buy",
          ticker,
        });
      }
      await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        date: 250,
        direction: "long",
        ownerId,
        price: 11,
        quantity: 2,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: "AAPL",
        validationErrors: [],
        validationWarnings: ["No CashReport section found"],
      });
    });

    const result = await t.query(internal.counterpart.listFills, {
      ownerId,
      paginationOpts: { cursor: null, numItems: 1 },
      ticker: "aapl",
    });
    expect(result.accepted.items).toHaveLength(1);
    expect(result.accepted.items[0]).toMatchObject({
      reviewStatus: "accepted",
      ticker: "AAPL",
    });
    expect(result.accepted.hasMore).toBe(true);
    expect(result.pending).toEqual({
      cap: 100,
      items: [
        expect.objectContaining({
          reviewStatus: "pending_review",
          ticker: "AAPL",
        }),
      ],
      truncated: false,
    });
  });

  it("creates check-ins idempotently and records exact-ID responses first-write-wins", async () => {
    const first = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: ["trade-a"],
      window: "late_morning",
    });
    const retry = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "briefing",
      ownerId,
      surfacedTradeIds: ["different-trade"],
      window: "late_morning",
    });
    expect(first.created).toBe(true);
    expect(retry).toEqual({ checkInId: first.checkInId, created: false });

    const [noteA, noteB, otherOwnerNote] = await t.run(async (ctx) => {
      return await Promise.all([
        ctx.db.insert("notes", {
          content: "first thought",
          noteDate: now,
          ownerId,
        }),
        ctx.db.insert("notes", {
          content: "second thought",
          noteDate: now + 1,
          ownerId,
        }),
        ctx.db.insert("notes", {
          content: "other owner's thought",
          noteDate: now + 2,
          ownerId: otherOwnerId,
        }),
      ]);
    });
    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: first.checkInId,
        ownerId: otherOwnerId,
        respondedAt: now,
      }),
    ).toBe("not_found");
    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: first.checkInId,
        noteIds: [otherOwnerNote],
        ownerId,
        respondedAt: now,
      }),
    ).toBe("invalid_note_ids");
    const unchangedAfterInvalidNote = await t.run(async (ctx) => {
      return await ctx.db.get(first.checkInId);
    });
    expect(unchangedAfterInvalidNote?.respondedAt).toBeUndefined();
    expect(unchangedAfterInvalidNote?.noteIds).toBeUndefined();
    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: first.checkInId,
        noteIds: [noteA],
        ownerId,
        respondedAt: now + 1_000,
      }),
    ).toBe("recorded");
    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: first.checkInId,
        noteIds: [noteA, noteB],
        ownerId,
        respondedAt: now + 9_000,
      }),
    ).toBe("recorded");

    const stored = await t.run(async (ctx) => {
      return await ctx.db.get(first.checkInId);
    });
    expect(stored?.respondedAt).toBe(now + 1_000);
    expect(stored?.noteIds).toEqual([noteA, noteB]);

    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: "not-a-check-in-id",
        ownerId,
        respondedAt: now,
      }),
    ).toBe("not_found");
    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: first.checkInId,
        noteIds: ["not-a-note-id"],
        ownerId,
        respondedAt: now,
      }),
    ).toBe("invalid_note_ids");
  });

  it("unions surfaced fills on a create-check-in retry", async () => {
    const [tradeA, tradeB] = await t.run(async (ctx) => {
      return await Promise.all(
        ["A", "B"].map((ticker, index) =>
          ctx.db.insert("trades", {
            assetType: "stock",
            date: Date.UTC(2026, 4, 14, 15 + index, 0, 0),
            direction: "long",
            ownerId,
            price: 100 + index,
            quantity: 1,
            side: "buy",
            ticker,
          }),
        ),
      );
    });
    const first = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [tradeA, tradeA],
      window: "late_morning",
    });
    const storedAfterCreate = await t.run(async (ctx) => {
      return await ctx.db.get(first.checkInId);
    });
    expect(storedAfterCreate?.surfacedTradeIds).toEqual([tradeA]);
    const retry = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [tradeA, tradeB],
      window: "late_morning",
    });
    expect(retry).toEqual({ checkInId: first.checkInId, created: false });

    const storedAfterRetry = await t.run(async (ctx) => {
      return await ctx.db.get(first.checkInId);
    });
    expect(storedAfterRetry?.surfacedTradeIds).toEqual([tradeA, tradeB]);

    const beforeResponse = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(beforeResponse.undiscussedFills.map((fill) => fill.id)).toEqual(
      expect.arrayContaining([tradeA, tradeB]),
    );

    expect(
      await t.mutation(internal.counterpart.recordCheckInResponse, {
        checkInId: first.checkInId,
        ownerId,
        respondedAt: now,
      }),
    ).toBe("recorded");
    const daily = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(daily.undiscussedFills).toEqual([]);
  });

  it("repairs duplicate stored surfaced IDs while unioning a retry", async () => {
    const checkInId = await t.run(async (ctx) => {
      return await ctx.db.insert("checkIns", {
        date: "2026-05-15",
        kind: "mirror",
        ownerId,
        sentAt: now,
        surfacedTradeIds: ["trade-a", "trade-a"],
        window: "late_morning",
      });
    });

    expect(
      await t.mutation(internal.counterpart.createCheckIn, {
        date: "2026-05-15",
        kind: "mirror",
        ownerId,
        surfacedTradeIds: ["trade-a", "trade-b"],
        window: "late_morning",
      }),
    ).toEqual({ checkInId, created: false });

    const stored = await t.run(async (ctx) => {
      return await ctx.db.get(checkInId);
    });
    expect(stored?.surfacedTradeIds).toEqual(["trade-a", "trade-b"]);
  });

  it("finds an existing check-in window beyond other same-day rows", async () => {
    const existingAfternoonId = await t.run(async (ctx) => {
      for (let index = 0; index < 4; index += 1) {
        await ctx.db.insert("checkIns", {
          date: "2026-05-15",
          kind: "mirror",
          ownerId,
          sentAt: now + index,
          window: "late_morning",
        });
      }
      return await ctx.db.insert("checkIns", {
        date: "2026-05-15",
        kind: "briefing",
        ownerId,
        sentAt: now + 10,
        window: "afternoon",
      });
    });

    expect(
      await t.mutation(internal.counterpart.createCheckIn, {
        date: "2026-05-15",
        kind: "backfill",
        ownerId,
        window: "afternoon",
      }),
    ).toEqual({ checkInId: existingAfternoonId, created: false });

    const daily = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(daily.todayCheckIns).toHaveLength(5);
  });

  it("returns NOT_FOUND from the response route for an unknown exact ID", async () => {
    process.env.COUNTERPART_TOKEN = "counterpart-only";
    process.env.COUNTERPART_OWNER_ID = ownerId;
    const response = await post(
      "/internal/counterpart/record-check-in-response",
      { checkInId: "not-a-check-in-id", respondedAt: now },
      "counterpart-only",
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Check-in not found",
        retryable: false,
      },
      ok: false,
    });
  });

  it("returns VALIDATION without recording when any note ID is foreign", async () => {
    const created = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      window: "late_morning",
    });
    const foreignNoteId = await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        content: "not this owner's note",
        noteDate: now,
        ownerId: otherOwnerId,
      });
    });
    process.env.COUNTERPART_TOKEN = "counterpart-only";
    process.env.COUNTERPART_OWNER_ID = ownerId;

    const response = await post(
      "/internal/counterpart/record-check-in-response",
      {
        checkInId: created.checkInId,
        noteIds: [foreignNoteId],
        respondedAt: now,
      },
      "counterpart-only",
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "noteIds must contain valid note IDs",
        retryable: false,
      },
      ok: false,
    });
    const stored = await t.run(async (ctx) => {
      return await ctx.db.get(created.checkInId);
    });
    expect(stored?.respondedAt).toBeUndefined();
    expect(stored?.noteIds).toBeUndefined();
  });

  it("reads a check-in by exact ID and hides missing or cross-owner IDs", async () => {
    const noteId = await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        content: "linked thought",
        noteDate: now,
        ownerId,
      });
    });
    const created = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-12",
      kind: "briefing",
      ownerId,
      surfacedTradeIds: ["trade-a"],
      window: "afternoon",
    });
    await t.mutation(internal.counterpart.recordCheckInResponse, {
      checkInId: created.checkInId,
      noteIds: [noteId],
      ownerId,
      respondedAt: now + 1_000,
    });
    process.env.COUNTERPART_TOKEN = "counterpart-only";
    process.env.COUNTERPART_OWNER_ID = ownerId;

    const found = await post(
      "/internal/counterpart/get-check-in",
      { checkInId: created.checkInId },
      "counterpart-only",
    );
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({
      data: {
        checkIn: {
          checkInId: created.checkInId,
          date: "2026-05-12",
          deliveredAt: null,
          kind: "briefing",
          noteIds: [noteId],
          respondedAt: now + 1_000,
          sentAt: now,
          surfacedTradeIds: ["trade-a"],
          window: "afternoon",
        },
      },
      ok: true,
    });

    const missing = await post(
      "/internal/counterpart/get-check-in",
      { checkInId: "not-a-check-in-id" },
      "counterpart-only",
    );
    expect(missing.status).toBe(404);

    process.env.COUNTERPART_OWNER_ID = otherOwnerId;
    const crossOwner = await post(
      "/internal/counterpart/get-check-in",
      { checkInId: created.checkInId },
      "counterpart-only",
    );
    expect(crossOwner.status).toBe(404);
  });

  it("confirms delivery first-write-wins and exposes it in daily context", async () => {
    const created = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      window: "end_of_day",
    });
    const before = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(before.todayCheckIns).toEqual([
      expect.objectContaining({
        checkInId: created.checkInId,
        deliveredAt: null,
      }),
    ]);

    process.env.COUNTERPART_TOKEN = "counterpart-only";
    process.env.COUNTERPART_OWNER_ID = ownerId;
    const first = await post(
      "/internal/counterpart/confirm-check-in-delivery",
      { checkInId: created.checkInId, deliveredAt: now + 1_000 },
      "counterpart-only",
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      data: { confirmed: true },
      ok: true,
    });
    const retry = await post(
      "/internal/counterpart/confirm-check-in-delivery",
      { checkInId: created.checkInId, deliveredAt: now + 9_000 },
      "counterpart-only",
    );
    expect(retry.status).toBe(200);

    const stored = await t.query(internal.counterpart.getCheckIn, {
      checkInId: created.checkInId,
      ownerId,
    });
    expect(stored?.deliveredAt).toBe(now + 1_000);
    const after = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(after.todayCheckIns).toEqual([
      expect.objectContaining({
        checkInId: created.checkInId,
        deliveredAt: now + 1_000,
      }),
    ]);

    process.env.COUNTERPART_OWNER_ID = otherOwnerId;
    const crossOwner = await post(
      "/internal/counterpart/confirm-check-in-delivery",
      { checkInId: created.checkInId, deliveredAt: now + 20_000 },
      "counterpart-only",
    );
    expect(crossOwner.status).toBe(404);

    process.env.COUNTERPART_OWNER_ID = ownerId;
    const missing = await post(
      "/internal/counterpart/confirm-check-in-delivery",
      { checkInId: "not-a-check-in-id", deliveredAt: now },
      "counterpart-only",
    );
    expect(missing.status).toBe(404);
  });

  it("returns broker null before the first statement while keeping derived state", async () => {
    await seedRecentFills();
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("brokerageConnections", {
        createdAt: now - 10_000,
        ownerId,
        queryId: "query-1",
        source: "ibkr",
        status: "error",
        updatedAt: now - 1_000,
      });
      await ctx.db.insert("brokerageSyncRuns", {
        connectionId,
        errorMessage: "statement unavailable",
        importedTrades: 0,
        ownerId,
        positionSnapshotCount: 0,
        queryId: "query-1",
        reconciliationIssueCount: 0,
        reportDate: "2026-05-14",
        reportType: "activity",
        requestedAt: now - 9_000,
        skippedDuplicateTrades: 0,
        source: "ibkr",
        startedAt: now - 8_000,
        status: "failed_terminal",
        updatedAt: now - 1_000,
      });
    });
    const context = await t.query(internal.counterpart.getPortfolioContext, {
      now,
      ownerId,
    });
    expect(context.broker).toBeNull();
    expect(context.syncStatus).toMatchObject({
      errorMessage: "statement unavailable",
      status: "failed_terminal",
    });
    expect(context.reconciliation).toEqual([]);
    expect(context.derived).toEqual({
      computedAt: now,
      positions: expect.arrayContaining([
        expect.objectContaining({ netQuantity: 2, ticker: "AAPL" }),
      ]),
    });
    expect(context.pendingInbox).toEqual({ byTicker: [], total: 1 });
  });

  it("returns every account's broker position and stored open reconciliation issues", async () => {
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("brokerageConnections", {
        createdAt: now - 10_000,
        ownerId,
        queryId: "query-1",
        source: "ibkr",
        status: "active",
        updatedAt: now - 10_000,
      });
      const syncRunId = await ctx.db.insert("brokerageSyncRuns", {
        completedAt: now - 1_000,
        connectionId,
        importedTrades: 1,
        ownerId,
        positionSnapshotCount: 2,
        queryId: "query-1",
        reconciliationIssueCount: 1,
        reportDate: "2026-05-14",
        reportType: "activity",
        requestedAt: now - 10_000,
        skippedDuplicateTrades: 2,
        source: "ibkr",
        startedAt: now - 9_000,
        status: "succeeded",
        updatedAt: now - 1_000,
        warnings: [
          "Skipped IBKR Order crypto-1 (BTC.USD): asset category CRYPTO is unsupported; only USD stock orders are supported",
          "Statement covered a partial trading day",
        ],
      });
      for (const [brokerageAccountId, quantity] of [
        ["U1", 2],
        ["U2", 3],
      ] as const) {
        await ctx.db.insert("brokeragePositionSnapshots", {
          assetType: "stock",
          brokerageAccountId,
          connectionId,
          createdAt: now,
          currency: "USD",
          marketValue: quantity * 100,
          ownerId,
          quantity,
          reportDate: "2026-05-14",
          syncRunId,
          ticker: "AAPL",
        });
      }
      await ctx.db.insert("brokerageReconciliationIssues", {
        actualQuantity: 5,
        brokerageAccountId: "U1",
        connectionId,
        createdAt: now,
        expectedQuantity: 2,
        issueType: "position_mismatch",
        message: "AAPL differs",
        ownerId,
        reportDate: "2026-05-14",
        severity: "warning",
        status: "open",
        syncRunId,
        ticker: "AAPL",
        updatedAt: now,
      });
    });

    const context = await t.query(internal.counterpart.getInstrumentContext, {
      notesLimit: 25,
      ownerId,
      ticker: "aapl",
    });
    expect(context.brokerPositions).toEqual([
      expect.objectContaining({ brokerageAccountId: "U1", quantity: 2 }),
      expect.objectContaining({ brokerageAccountId: "U2", quantity: 3 }),
    ]);
    expect(context.openReconciliationIssues).toEqual([
      expect.objectContaining({
        issueType: "position_mismatch",
        message: "AAPL differs",
        reportDate: "2026-05-14",
      }),
    ]);

    const portfolio = await t.query(internal.counterpart.getPortfolioContext, {
      now,
      ownerId,
    });
    expect(portfolio.broker?.positions).toHaveLength(2);
    expect(portfolio.syncStatus).toMatchObject({
      skippedDuplicateTrades: 2,
      skippedOrders: [
        {
          reason:
            "asset category CRYPTO is unsupported; only USD stock orders are supported",
          ticker: "BTC.USD",
        },
      ],
      warnings: ["Statement covered a partial trading day"],
    });
  });

  it("selects activity syncs even when newer confirmation runs exist", async () => {
    await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("brokerageConnections", {
        createdAt: now - 20_000,
        ownerId,
        queryId: "query-activity-selection",
        source: "ibkr",
        status: "active",
        updatedAt: now,
      });
      await ctx.db.insert("brokerageSyncRuns", {
        connectionId,
        importedTrades: 7,
        ownerId,
        positionSnapshotCount: 0,
        queryId: "activity-run",
        reconciliationIssueCount: 0,
        reportDate: "2026-05-14",
        reportType: "activity",
        requestedAt: now - 10_000,
        skippedDuplicateTrades: 0,
        source: "ibkr",
        startedAt: now - 9_000,
        status: "succeeded",
        updatedAt: now - 8_000,
      });
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("brokerageSyncRuns", {
          connectionId,
          importedTrades: 100 + index,
          ownerId,
          positionSnapshotCount: 0,
          queryId: `confirmation-${index}`,
          reconciliationIssueCount: 0,
          reportDate: "2026-05-15",
          reportType: "trade_confirmation",
          requestedAt: now + index,
          skippedDuplicateTrades: 0,
          source: "ibkr",
          startedAt: now + index,
          status: "succeeded",
          updatedAt: now + index,
        });
      }
    });

    const daily = await t.query(internal.counterpart.getDailyContext, {
      now,
      ownerId,
    });
    expect(daily.syncStatus).toMatchObject({
      importedTrades: 7,
      reportDate: "2026-05-14",
    });
    const portfolio = await t.query(internal.counterpart.getPortfolioContext, {
      now,
      ownerId,
    });
    expect(portfolio.syncStatus).toMatchObject({ importedTrades: 7 });
    expect(portfolio.broker).toMatchObject({ asOf: "2026-05-14" });
  });

  it("returns ordered instrument notes, latest usable price, and bounded pending fills", async () => {
    await t.run(async (ctx) => {
      for (const [content, noteDate] of [
        ["old", 100],
        ["new", 300],
        ["middle", 200],
      ] as const) {
        await ctx.db.insert("notes", {
          content,
          noteDate,
          ownerId,
          ticker: "AAPL",
        });
      }
      for (const date of [100, 200]) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          date,
          direction: "long",
          ownerId,
          price: date,
          quantity: 1,
          side: "buy",
          ticker: "AAPL",
        });
      }
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("inboxTrades", {
          assetType: "stock",
          date: index,
          direction: "long",
          ownerId,
          price: 100,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          status: "pending_review",
          ticker: "AAPL",
          validationErrors: [],
          validationWarnings: [],
        });
      }
      await ctx.db.insert("inboxTrades", {
        ownerId: otherOwnerId,
        source: "ibkr",
        status: "pending_review",
        ticker: "AAPL",
        validationErrors: [],
        validationWarnings: [],
      });
      await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: now,
        lastResolvedAt: now,
        ownerId,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        resolutionStatus: "resolved",
        symbol: "AAPL",
        updatedAt: now,
      });
      await ctx.db.insert("marketPriceSnapshots", {
        close: 190,
        date: "2026-05-14",
        fetchedAt: now,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        status: "ok",
      });
      await ctx.db.insert("marketPriceSnapshots", {
        date: "2026-05-15",
        errorMessage: "provider unavailable",
        fetchedAt: now + 1,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        status: "error",
      });
    });

    const context = await t.query(internal.counterpart.getInstrumentContext, {
      notesLimit: 2,
      ownerId,
      ticker: "aapl",
    });
    expect(context.notes).toMatchObject({
      hasMore: true,
      totalCount: 3,
    });
    expect(context.notes.nextCursor).not.toBeNull();
    expect(context.notes.items.map((note) => note.content)).toEqual([
      "new",
      "middle",
    ]);
    expect(context.latestPrice).toEqual({
      close: 190,
      date: "2026-05-14",
    });
    expect(context.recentAcceptedFills.map((fill) => fill.date)).toEqual([
      200, 100,
    ]);
    expect(context.pendingFills).toMatchObject({
      cap: 100,
      truncated: true,
    });
    expect(context.pendingFills.items).toHaveLength(100);
    expect(
      context.pendingFills.items.every(
        (fill) => fill.reviewStatus === "pending_review",
      ),
    ).toBe(true);

    const portfolio = await t.query(internal.counterpart.getPortfolioContext, {
      now,
      ownerId,
    });
    expect(portfolio.pendingInbox).toEqual({
      byTicker: [{ count: 101, ticker: "AAPL" }],
      total: 101,
    });
  });

  it("fails closed instead of returning partial positions above the trade limit", async () => {
    await t.run(async (ctx) => {
      for (let index = 0; index < 5_001; index += 1) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          date: Date.UTC(2026, 4, 14, 15, 0, 0),
          direction: "long",
          ownerId,
          price: 100,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "LIMIT",
        });
      }
    });

    await expect(
      t.query(internal.counterpart.getDailyContext, { now, ownerId }),
    ).rejects.toThrow(
      "Counterpart position calculation exceeds the 5000-trade limit",
    );
  });

  it("returns the strategy document without reading retired plan-layer tables", async () => {
    expect(
      await t.query(internal.counterpart.getStrategyContext, { ownerId }),
    ).toEqual({ strategyDoc: null });
    await t.run(async (ctx) => {
      await ctx.db.insert("strategyDoc", {
        content: "Size risk before conviction.",
        ownerId,
        updatedAt: now,
      });
    });
    expect(
      await t.query(internal.counterpart.getStrategyContext, { ownerId }),
    ).toEqual({
      strategyDoc: { content: "Size risk before conviction.", updatedAt: now },
    });
  });
});
