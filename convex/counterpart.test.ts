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
      ["add-note", { content: "note", noteDate: now }],
      [
        "create-check-in",
        {
          date: "2026-05-15",
          kind: "mirror",
          window: "late_morning",
        },
      ],
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

    const [noteA, noteB] = await t.run(async (ctx) => {
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
      ]);
    });
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
      now,
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
