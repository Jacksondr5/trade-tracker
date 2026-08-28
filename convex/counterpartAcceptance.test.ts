// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  inferPortfolioFromOpenEpisode,
  type EpisodeTradeEvidence,
} from "./imports";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ownerId = "counterpart-owner";
const otherOwnerId = "other-owner";

describe("counterpart trade acceptance", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
    process.env.COUNTERPART_TOKEN = "counterpart-test-token";
    process.env.COUNTERPART_OWNER_ID = ownerId;
  });

  afterEach(() => {
    delete process.env.COUNTERPART_TOKEN;
    delete process.env.COUNTERPART_OWNER_ID;
  });

  async function seedPortfolio(name = "Core") {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name,
        ownerId,
      });
    });
  }

  async function seedAcceptedTrade(args: {
    brokerageAccountId?: string | null;
    date: number;
    direction: "long" | "short";
    portfolioId?: Id<"portfolios">;
    price?: number;
    quantity: number;
    side: "buy" | "sell";
    source?: "ibkr" | "kraken" | "manual";
    ticker?: string;
  }) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId:
          args.brokerageAccountId === null
            ? undefined
            : (args.brokerageAccountId ?? "acct-1"),
        date: args.date,
        direction: args.direction,
        ownerId,
        portfolioId: args.portfolioId,
        price: args.price ?? 100,
        quantity: args.quantity,
        side: args.side,
        source: args.source ?? "ibkr",
        ticker: args.ticker ?? "AAPL",
      });
    });
  }

  async function seedPendingTrade(args: {
    brokerageAccountId?: string;
    date: number;
    direction?: "long" | "short";
    price?: number;
    quantity?: number;
    side?: "buy" | "sell";
    source?: "ibkr" | "kraken" | "manual";
    ticker?: string;
  }) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: args.brokerageAccountId ?? "acct-1",
        date: args.date,
        direction: args.direction ?? "long",
        ownerId,
        price: args.price ?? 101,
        quantity: args.quantity ?? 1,
        side: args.side ?? "buy",
        source: args.source ?? "ibkr",
        status: "pending_review",
        ticker: args.ticker ?? "AAPL",
        validationErrors: [],
        validationWarnings: [],
      });
    });
  }

  async function seedResolvedInstrument(ticker = "AAPL") {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: 1,
        ownerId,
        provider: "twelve_data",
        providerSymbol: ticker,
        resolutionStatus: "resolved",
        symbol: ticker,
        updatedAt: 1,
      });
    });
  }

  function evidence(args: {
    date: number;
    direction: "long" | "short";
    portfolioId: Id<"portfolios">;
    portfolioName?: string;
    quantity: number;
    side: "buy" | "sell";
    tradeId: Id<"trades">;
  }): EpisodeTradeEvidence {
    return {
      ...args,
      _creationTime: args.date,
      portfolioName: args.portfolioName ?? "Core",
      price: 100,
      ticker: "AAPL",
    };
  }

  it("inherits within long adds, long trims, and short adds", async () => {
    const portfolioId = await seedPortfolio();
    const first = await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 10,
      side: "buy",
    });
    const trim = await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId,
      quantity: 3,
      side: "sell",
    });
    const shortOpen = await seedAcceptedTrade({
      date: 3,
      direction: "short",
      portfolioId,
      quantity: 5,
      side: "sell",
    });
    const shortAdd = await seedAcceptedTrade({
      date: 4,
      direction: "short",
      portfolioId,
      quantity: 2,
      side: "sell",
    });

    expect(
      inferPortfolioFromOpenEpisode([
        evidence({
          date: 1,
          direction: "long",
          portfolioId,
          quantity: 10,
          side: "buy",
          tradeId: first,
        }),
      ]),
    ).toMatchObject({
      kind: "inferred",
      openPositionSignedQuantity: 10,
      portfolioId,
    });
    expect(
      inferPortfolioFromOpenEpisode([
        evidence({
          date: 1,
          direction: "long",
          portfolioId,
          quantity: 10,
          side: "buy",
          tradeId: first,
        }),
        evidence({
          date: 2,
          direction: "long",
          portfolioId,
          quantity: 3,
          side: "sell",
          tradeId: trim,
        }),
      ]),
    ).toMatchObject({
      inheritedFromTrade: { tradeId: trim },
      kind: "inferred",
      openPositionSignedQuantity: 7,
    });
    expect(
      inferPortfolioFromOpenEpisode([
        evidence({
          date: 3,
          direction: "short",
          portfolioId,
          quantity: 5,
          side: "sell",
          tradeId: shortOpen,
        }),
        evidence({
          date: 4,
          direction: "short",
          portfolioId,
          quantity: 2,
          side: "sell",
          tradeId: shortAdd,
        }),
      ]),
    ).toMatchObject({
      kind: "inferred",
      openPositionSignedQuantity: -7,
    });
  });

  it("refuses a flat opening boundary and implausible partial history", async () => {
    const portfolioId = await seedPortfolio();
    const buy = await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 10,
      side: "buy",
    });
    const sell = await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId,
      quantity: 10,
      side: "sell",
    });
    expect(
      inferPortfolioFromOpenEpisode([
        evidence({
          date: 1,
          direction: "long",
          portfolioId,
          quantity: 10,
          side: "buy",
          tradeId: buy,
        }),
        evidence({
          date: 2,
          direction: "long",
          portfolioId,
          quantity: 10,
          side: "sell",
          tradeId: sell,
        }),
      ]),
    ).toEqual({ kind: "needsPortfolio", reason: "opening_trade" });
    expect(
      inferPortfolioFromOpenEpisode([
        evidence({
          date: 2,
          direction: "long",
          portfolioId,
          quantity: 2,
          side: "sell",
          tradeId: sell,
        }),
      ]),
    ).toEqual({ kind: "needsPortfolio", reason: "implausible_history" });
  });

  it("inherits a short episode for a buy-to-cover and an exact closing fill", async () => {
    const portfolioId = await seedPortfolio();
    await seedAcceptedTrade({
      date: 1,
      direction: "short",
      portfolioId,
      quantity: 5,
      side: "sell",
    });
    const cover = await seedPendingTrade({
      date: 2,
      direction: "short",
      quantity: 5,
      side: "buy",
    });
    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      {
        inboxTradeId: cover,
        ownerId,
      },
    );
    expect(prepared).toMatchObject({
      kind: "ready",
      portfolio: {
        evidence: { openPositionSignedQuantity: -5 },
        id: portfolioId,
        reason: "open_episode_inheritance",
      },
    });
  });

  it("returns needsPortfolio candidates for a flat opener", async () => {
    const portfolioId = await seedPortfolio();
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 2,
      side: "buy",
    });
    await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId,
      quantity: 2,
      side: "sell",
    });
    const opener = await seedPendingTrade({ date: 3 });
    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      {
        inboxTradeId: opener,
        ownerId,
      },
    );
    expect(prepared).toMatchObject({
      candidates: [
        {
          evidenceCount: 2,
          portfolioId,
          portfolioName: "Core",
        },
      ],
      kind: "needsPortfolio",
      reason: "opening_trade",
    });
  });

  it("refuses to infer when accepted history exceeds the bounded scan", async () => {
    const portfolioId = await seedPortfolio();
    await t.run(async (ctx) => {
      for (let date = 1; date <= 5_001; date += 1) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          brokerageAccountId: "acct-1",
          date,
          direction: "long",
          ownerId,
          portfolioId,
          price: 100,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "AAPL",
        });
      }
    });
    const inboxTradeId = await seedPendingTrade({ date: 5_002 });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId },
    );

    expect(prepared).toMatchObject({
      kind: "needsPortfolio",
      reason: "history_scan_limit",
    });
  });

  it("refuses out-of-order acceptance and names the older fill", async () => {
    const older = await seedPendingTrade({ date: 1 });
    const newer = await seedPendingTrade({ date: 2 });
    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      {
        inboxTradeId: newer,
        ownerId,
        portfolioId: await seedPortfolio(),
      },
    );
    expect(prepared).toMatchObject({
      kind: "outOfOrder",
      conflict: {
        kind: "older_pending",
        date: 1,
        inboxTradeId: older,
        ticker: "AAPL",
      },
    });
  });

  it("refuses a fill backdated before accepted ticker history", async () => {
    const portfolioId = await seedPortfolio();
    const acceptedTradeId = await seedAcceptedTrade({
      date: 10,
      direction: "long",
      portfolioId,
      quantity: 1,
      side: "buy",
    });
    const inboxTradeId = await seedPendingTrade({ date: 5 });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId, portfolioId },
    );

    expect(prepared).toMatchObject({
      conflict: {
        date: 10,
        kind: "newer_accepted",
        ticker: "AAPL",
        tradeId: acceptedTradeId,
      },
      kind: "outOfOrder",
    });
  });

  it("bounds accepted history per ticker before enforcing accepted ordering", async () => {
    const portfolioId = await seedPortfolio();
    await t.run(async (ctx) => {
      for (let date = 1; date <= 5_001; date += 1) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          brokerageAccountId: "acct-1",
          date,
          direction: "long",
          ownerId,
          portfolioId,
          price: 100,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "MSFT",
        });
      }
    });
    const acceptedTradeId = await seedAcceptedTrade({
      date: 10_000,
      direction: "long",
      portfolioId,
      quantity: 1,
      side: "buy",
    });
    const inboxTradeId = await seedPendingTrade({ date: 9_999 });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId },
    );

    expect(prepared).toMatchObject({
      conflict: {
        date: 10_000,
        kind: "newer_accepted",
        ticker: "AAPL",
        tradeId: acceptedTradeId,
      },
      kind: "outOfOrder",
    });
  });

  it("shares daily-context episode state when a manual trade closes the position", async () => {
    const portfolioId = await seedPortfolio();
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 2,
      side: "buy",
    });
    await seedAcceptedTrade({
      brokerageAccountId: null,
      date: 2,
      direction: "long",
      portfolioId,
      quantity: 2,
      side: "sell",
      source: "manual",
    });
    const inboxTradeId = await seedPendingTrade({ date: 3 });

    const [dailyContext, prepared] = await Promise.all([
      t.query(internal.counterpart.getDailyContext, {
        now: Date.now(),
        ownerId,
      }),
      t.query(internal.imports.prepareCounterpartAcceptance, {
        inboxTradeId,
        ownerId,
      }),
    ]);

    expect(dailyContext.openPositions).toEqual([]);
    expect(prepared).toMatchObject({
      kind: "needsPortfolio",
      reason: "opening_trade",
    });
  });

  it("keeps fractional exact-close and next-opener boundaries stable through HTTP", async () => {
    const portfolioId = await seedPortfolio();
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 1_000.1,
      side: "buy",
    });
    await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId,
      quantity: 0.2,
      side: "buy",
    });
    await seedResolvedInstrument();
    const closeId = await seedPendingTrade({
      date: 3,
      quantity: 1_000.3,
      side: "sell",
    });

    const closeResponse = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId: closeId, ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(closeResponse.status).toBe(200);
    expect(await closeResponse.json()).toMatchObject({
      data: {
        kind: "accepted",
        portfolio: {
          id: portfolioId,
          reason: "open_episode_inheritance",
        },
      },
      ok: true,
    });

    const openerId = await seedPendingTrade({ date: 4 });
    const openerResponse = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId: openerId, ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(openerResponse.status).toBe(200);
    expect(await openerResponse.json()).toMatchObject({
      data: { kind: "needsPortfolio", reason: "opening_trade" },
      ok: true,
    });
  });

  it("inherits from the reopened episode rather than the prior closed one", async () => {
    const firstPortfolioId = await seedPortfolio("First");
    const reopenedPortfolioId = await seedPortfolio("Reopened");
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId: firstPortfolioId,
      quantity: 1,
      side: "buy",
    });
    await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId: firstPortfolioId,
      quantity: 1,
      side: "sell",
    });
    const reopenedTradeId = await seedAcceptedTrade({
      date: 3,
      direction: "long",
      portfolioId: reopenedPortfolioId,
      quantity: 2,
      side: "buy",
    });
    await seedResolvedInstrument();
    const inboxTradeId = await seedPendingTrade({
      date: 4,
      quantity: 0.5,
      side: "sell",
    });

    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId, ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        kind: "accepted",
        portfolio: {
          evidence: {
            groupOpeningTradeDate: 3,
            inheritedFromTrade: { tradeId: reopenedTradeId },
            openPositionSignedQuantity: 2,
          },
          id: reopenedPortfolioId,
          name: "Reopened",
        },
      },
      ok: true,
    });
  });

  it("fails closed when accepted history changes between prepare and commit", async () => {
    const portfolioId = await seedPortfolio();
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 1,
      side: "buy",
    });
    const instrumentId = await seedResolvedInstrument();
    const inboxTradeId = await seedPendingTrade({ date: 3 });
    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId },
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind !== "ready") throw new Error("Expected ready context");

    await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId,
      quantity: 1,
      side: "buy",
    });
    const result = await t.mutation(
      internal.imports.commitInboxTradeAcceptanceInternal,
      {
        counterpartContext: {
          expected: {
            portfolio: {
              groupOpeningTradeDate:
                prepared.portfolio.evidence.groupOpeningTradeDate,
              inheritedFromTradeId:
                prepared.portfolio.evidence.inheritedFromTrade?.tradeId ?? null,
              openPositionSignedQuantity:
                prepared.portfolio.evidence.openPositionSignedQuantity,
              portfolioId: prepared.portfolio.id,
              reason: prepared.portfolio.reason,
            },
            trade: prepared.trade,
          },
        },
        inboxTradeId,
        instrumentId,
        ownerId,
        portfolioId,
      },
    );

    expect(result).toEqual({
      accepted: false,
      error: "Acceptance context changed; refresh before retrying",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(inboxTradeId)).not.toBeNull();
    });
  });

  it("returns 403 for an owner echo mismatch", async () => {
    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({
        inboxTradeId: "not-used",
        ownerId: otherOwnerId,
      }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "ownerId does not match the configured counterpart owner",
        retryable: false,
      },
      ok: false,
    });
  });

  it("returns non-retryable 400 for a malformed inbox trade ID", async () => {
    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId: "malformed", ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "inboxTradeId must be a valid inboxTrades document ID",
        retryable: false,
      },
      ok: false,
    });
  });

  it("returns non-retryable 404 for a missing valid inbox trade ID", async () => {
    const inboxTradeId = await seedPendingTrade({ date: 1 });
    await t.run(async (ctx) => {
      await ctx.db.delete(inboxTradeId);
    });

    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId, ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Inbox trade not found",
        retryable: false,
      },
      ok: false,
    });
  });

  it("returns non-retryable 400 for a malformed portfolio ID", async () => {
    const inboxTradeId = await seedPendingTrade({ date: 1 });
    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({
        inboxTradeId,
        ownerId,
        portfolioId: "malformed",
      }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "portfolioId must be a valid portfolios document ID",
        retryable: false,
      },
      ok: false,
    });
  });

  it("maps a structured acceptance error to the HTTP error envelope", async () => {
    const inboxTradeId = await t.run(async (ctx) => {
      return await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "ibkr",
        status: "pending_review",
        ticker: "AAPL",
        validationErrors: [],
        validationWarnings: [],
      });
    });
    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId, ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION", retryable: false },
      ok: false,
    });
  });

  it("accepts through the canonical action path and removes the inbox row", async () => {
    const portfolioId = await seedPortfolio();
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId,
      quantity: 2,
      side: "buy",
    });
    await seedResolvedInstrument();
    const inboxTradeId = await seedPendingTrade({ date: 2, quantity: 1 });

    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId, ownerId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        kind: "accepted",
        portfolio: {
          id: portfolioId,
          name: "Core",
          reason: "open_episode_inheritance",
        },
        trade: {
          date: 2,
          inboxTradeId,
          price: 101,
          quantity: 1,
          side: "buy",
          ticker: "AAPL",
        },
      },
      ok: true,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(inboxTradeId)).toBeNull();
      const trades = (await ctx.db.query("trades").collect()).filter(
        (trade) => trade.ownerId === ownerId,
      );
      expect(trades).toHaveLength(2);
      expect(trades[1]).toMatchObject({ portfolioId, ticker: "AAPL" });
      expect(trades[1]).not.toHaveProperty("tradePlanId");
    });
  });
});
