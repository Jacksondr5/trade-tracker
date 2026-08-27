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
    date: number;
    direction: "long" | "short";
    portfolioId?: Id<"portfolios">;
    quantity: number;
    side: "buy" | "sell";
  }) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "acct-1",
        date: args.date,
        direction: args.direction,
        ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: args.quantity,
        side: args.side,
        source: "ibkr",
        ticker: "AAPL",
      });
    });
  }

  async function seedPendingTrade(args: {
    date: number;
    direction?: "long" | "short";
    quantity?: number;
    side?: "buy" | "sell";
  }) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: "acct-1",
        date: args.date,
        direction: args.direction ?? "long",
        ownerId,
        price: 101,
        quantity: args.quantity ?? 1,
        side: args.side ?? "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: "AAPL",
        validationErrors: [],
        validationWarnings: [],
      });
    });
  }

  async function seedResolvedInstrument() {
    await t.run(async (ctx) => {
      await ctx.db.insert("marketDataInstruments", {
        assetType: "stock",
        createdAt: 1,
        ownerId,
        provider: "twelve_data",
        providerSymbol: "AAPL",
        resolutionStatus: "resolved",
        symbol: "AAPL",
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
      for (let date = 1; date <= 1_001; date += 1) {
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
    const inboxTradeId = await seedPendingTrade({ date: 1_002 });

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
      olderTrade: { date: 1, inboxTradeId: older, ticker: "AAPL" },
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
