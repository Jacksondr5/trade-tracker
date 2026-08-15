// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import {
  isCounterpartRequestAuthorized,
  validateAddNoteBody,
  validateLogCheckInBody,
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
        assetType: "stock",
        date: Date.UTC(2026, 4, 14, 16, 0, 0),
        direction: "long",
        ownerId,
        price: 50,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: "MSFT",
        validationErrors: [],
        validationWarnings: [],
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

  it("resurfaces unanswered fills and excludes them only after a response", async () => {
    const { accepted, pending } = await seedRecentFills();
    const noteId = await t.mutation(internal.counterpart.addNote, {
      content: "  AAPL entry was a starter position.  ",
      ownerId,
      ticker: " AAPL ",
    });

    const initial = await t.query(internal.counterpart.getDailyContext, {
      ownerId,
    });
    expect(initial.undiscussedFills.map((fill) => fill.id)).toEqual(
      expect.arrayContaining([accepted, pending]),
    );
    expect(initial.undiscussedFills.map((fill) => fill.ticker)).not.toContain(
      "OLD",
    );
    expect(initial.openPositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bare: true, quantity: 2, ticker: "AAPL" }),
      ]),
    );
    expect(initial.recentNotes).toEqual([
      expect.objectContaining({
        content: "AAPL entry was a starter position.",
        id: noteId,
        ticker: "AAPL",
      }),
    ]);

    const checkInId = await t.mutation(internal.counterpart.logCheckIn, {
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [accepted, pending],
      window: "late_morning",
    });
    const sent = await t.query(internal.counterpart.getDailyContext, {
      ownerId,
    });
    expect(sent.undiscussedFills.map((fill) => fill.id)).toEqual(
      expect.arrayContaining([accepted, pending]),
    );
    expect(sent.todayCheckIns).toEqual([
      expect.objectContaining({ respondedAt: null, window: "late_morning" }),
    ]);

    vi.setSystemTime(now + 60_000);
    const updatedCheckInId = await t.mutation(internal.counterpart.logCheckIn, {
      kind: "mirror",
      noteIds: [noteId],
      ownerId,
      respondedAt: now + 60_000,
      surfacedTradeIds: [accepted, pending],
      window: "late_morning",
    });
    expect(updatedCheckInId).toBe(checkInId);

    const answered = await t.query(internal.counterpart.getDailyContext, {
      ownerId,
    });
    expect(answered.undiscussedFills).toEqual([]);
    expect(answered.todayCheckIns).toEqual([
      expect.objectContaining({
        respondedAt: now + 60_000,
        window: "late_morning",
      }),
    ]);
    expect(answered.todayCheckIns).toHaveLength(1);
  });

  it("enforces the dedicated token and validates external payloads", () => {
    process.env.COUNTERPART_TOKEN = "counterpart-only";
    expect(
      isCounterpartRequestAuthorized(
        new Request("https://example.test", {
          headers: { authorization: "Bearer counterpart-only" },
        }),
      ),
    ).toBe(true);
    expect(
      isCounterpartRequestAuthorized(
        new Request("https://example.test", {
          headers: { authorization: "Bearer another-token" },
        }),
      ),
    ).toBe(false);
    expect(() => validateAddNoteBody({ content: " ", ownerId })).toThrow(
      "content is required",
    );
    expect(() =>
      validateLogCheckInBody({
        kind: "mirror",
        ownerId,
        window: "tomorrow",
      }),
    ).toThrow("window must be one of");
  });
});
