// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  acceptedHistoryAtOrBeforeFill,
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
    date?: number;
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
        ...(args.date === undefined ? {} : { date: args.date }),
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
    creationTime?: number;
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
      _creationTime: args.creationTime ?? args.date,
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

  it("orders an episode by fill date and creation time before inferring", async () => {
    const firstPortfolioId = await seedPortfolio("First");
    const reopenedPortfolioId = await seedPortfolio("Reopened");
    const firstOpenId = await seedAcceptedTrade({
      date: 1,
      direction: "long",
      portfolioId: firstPortfolioId,
      quantity: 1,
      side: "buy",
    });
    const firstCloseId = await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId: firstPortfolioId,
      quantity: 1,
      side: "sell",
    });
    const reopenedId = await seedAcceptedTrade({
      date: 2,
      direction: "long",
      portfolioId: reopenedPortfolioId,
      quantity: 1,
      side: "buy",
    });

    const inferred = inferPortfolioFromOpenEpisode([
      evidence({
        creationTime: 3,
        date: 2,
        direction: "long",
        portfolioId: reopenedPortfolioId,
        portfolioName: "Reopened",
        quantity: 1,
        side: "buy",
        tradeId: reopenedId,
      }),
      evidence({
        creationTime: 2,
        date: 2,
        direction: "long",
        portfolioId: firstPortfolioId,
        portfolioName: "First",
        quantity: 1,
        side: "sell",
        tradeId: firstCloseId,
      }),
      evidence({
        creationTime: 1,
        date: 1,
        direction: "long",
        portfolioId: firstPortfolioId,
        portfolioName: "First",
        quantity: 1,
        side: "buy",
        tradeId: firstOpenId,
      }),
    ]);

    expect(inferred).toMatchObject({
      groupOpeningTradeDate: 2,
      inheritedFromTrade: { tradeId: reopenedId },
      kind: "inferred",
      portfolioId: reopenedPortfolioId,
      portfolioName: "Reopened",
    });
  });

  it("clamps accepted episode history at the fill date", () => {
    const history = [{ date: 1 }, { date: 2 }, { date: 3 }];

    expect(acceptedHistoryAtOrBeforeFill(history, 2)).toEqual([
      { date: 1 },
      { date: 2 },
    ]);
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

  it("accepts two same-date fills sequentially without treating accept time as fill order", async () => {
    const portfolioId = await seedPortfolio();
    await seedResolvedInstrument();
    const firstInboxTradeId = await seedPendingTrade({ date: 10 });
    const secondInboxTradeId = await seedPendingTrade({ date: 10 });

    const firstResponse = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({
        inboxTradeId: firstInboxTradeId,
        portfolioId,
      }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({
      data: { kind: "accepted", portfolio: { id: portfolioId } },
      ok: true,
    });

    const secondResponse = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId: secondInboxTradeId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toMatchObject({
      data: {
        kind: "accepted",
        portfolio: {
          evidence: { groupOpeningTradeDate: 10 },
          id: portfolioId,
          reason: "open_episode_inheritance",
        },
      },
      ok: true,
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

  it("returns every owned portfolio for a zero-history opening fill", async () => {
    const alpha = await seedPortfolio("Alpha");
    const swing = await seedPortfolio("Swing");
    const inboxTradeId = await seedPendingTrade({ date: 1, ticker: "GDX" });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId },
    );

    if (prepared.kind !== "needsPortfolio") throw new Error("Expected menu");
    expect(prepared).toMatchObject({ reason: "opening_trade" });
    expect(prepared.candidates).toEqual([
      {
        evidence: [],
        evidenceCount: 0,
        mostRecentTradeDate: null,
        portfolioId: alpha,
        portfolioName: "Alpha",
      },
      {
        evidence: [],
        evidenceCount: 0,
        mostRecentTradeDate: null,
        portfolioId: swing,
        portfolioName: "Swing",
      },
    ]);
  });

  it("orders evidenced portfolio candidates by recency before the full menu", async () => {
    const alpha = await seedPortfolio("Alpha");
    const core = await seedPortfolio("Core");
    const swing = await seedPortfolio("Swing");
    for (const [date, portfolioId, side] of [
      [1, core, "buy"],
      [2, core, "sell"],
      [3, swing, "buy"],
      [4, swing, "sell"],
    ] as const) {
      await seedAcceptedTrade({
        date,
        direction: "long",
        portfolioId,
        quantity: 1,
        side,
        ticker: "GDX",
      });
    }
    const inboxTradeId = await seedPendingTrade({ date: 5, ticker: "GDX" });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId },
    );

    if (prepared.kind !== "needsPortfolio") throw new Error("Expected menu");
    expect(
      prepared.candidates.map((candidate) => candidate.portfolioId),
    ).toEqual([swing, core, alpha]);
    expect(prepared.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceCount: 2,
          mostRecentTradeDate: 4,
          portfolioId: swing,
        }),
        expect.objectContaining({
          evidence: [],
          evidenceCount: 0,
          mostRecentTradeDate: null,
          portfolioId: alpha,
        }),
      ]),
    );
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

  it("includes a legacy lowercase accepted close in episode inference", async () => {
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
      ticker: "aapl",
    });
    const inboxTradeId = await seedPendingTrade({ date: 3 });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId },
    );

    expect(prepared).toMatchObject({
      kind: "needsPortfolio",
      reason: "opening_trade",
    });
  });

  it("includes a legacy lowercase pending fill in oldest-first ordering", async () => {
    const portfolioId = await seedPortfolio();
    const olderInboxTradeId = await seedPendingTrade({
      date: 1,
      ticker: "aapl",
    });
    const inboxTradeId = await seedPendingTrade({ date: 2 });

    const prepared = await t.query(
      internal.imports.prepareCounterpartAcceptance,
      { inboxTradeId, ownerId, portfolioId },
    );

    expect(prepared).toMatchObject({
      conflict: {
        date: 1,
        inboxTradeId: olderInboxTradeId,
        kind: "older_pending",
        ticker: "AAPL",
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
      body: JSON.stringify({ inboxTradeId: closeId }),
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
      body: JSON.stringify({ inboxTradeId: openerId }),
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
      body: JSON.stringify({ inboxTradeId }),
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

  it("rejects an ownerId field as an unknown request field", async () => {
    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({
        inboxTradeId: "not-used",
        ownerId,
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
        message: "Unknown field: ownerId",
        retryable: false,
      },
      ok: false,
    });
  });

  it("returns non-retryable 400 for a malformed inbox trade ID", async () => {
    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId: "malformed" }),
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
      body: JSON.stringify({ inboxTradeId }),
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
      body: JSON.stringify({ inboxTradeId }),
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
      body: JSON.stringify({ inboxTradeId }),
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

  it("replays a durable accepted receipt after a lost accept response", async () => {
    const portfolioId = await seedPortfolio();
    await seedResolvedInstrument();
    const inboxTradeId = await seedPendingTrade({ date: 1 });
    const first = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId, portfolioId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { alreadyAccepted: boolean; tradeId: Id<"trades"> };
    };
    expect(firstBody.data.alreadyAccepted).toBe(false);

    const retry = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      data: {
        alreadyAccepted: true,
        kind: "accepted",
        trade: { inboxTradeId },
        tradeId: firstBody.data.tradeId,
      },
      ok: true,
    });
    const discussion = await t.fetch(
      "/internal/counterpart/fill-discussion-context",
      {
        body: JSON.stringify({ inboxTradeId }),
        headers: {
          authorization: "Bearer counterpart-test-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(await discussion.json()).toMatchObject({
      data: { fill: { state: "accepted", tradeId: firstBody.data.tradeId } },
      ok: true,
    });
    await t.run(async (ctx) => {
      const acceptedTrade = await ctx.db.get(firstBody.data.tradeId);
      expect(acceptedTrade?.sourceInboxTradeId).toBe(inboxTradeId);
    });
  });

  it("bounds discussion evidence by the fill date through today", async () => {
    const discussionNow = Date.UTC(2026, 4, 15, 4, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(discussionNow);
    try {
      // UTC midnight is still the prior Eastern calendar date. The boundary
      // check-in catches accidental UTC treatment of the numeric fill date.
      const inboxTradeId = await seedPendingTrade({
        date: Date.UTC(2026, 4, 8, 0, 0, 0),
        ticker: "GDX",
      });
      await t.run(async (ctx) => {
        for (let index = 0; index < 101; index += 1) {
          await ctx.db.insert("checkIns", {
            date: new Date(Date.UTC(2025, 11, 1 + index))
              .toISOString()
              .slice(0, 10),
            kind: "mirror",
            ownerId,
            sentAt: index,
            surfacedTradeIds: [],
            window: "late_morning",
          });
        }
        await ctx.db.insert("checkIns", {
          date: "2026-04-30",
          kind: "mirror",
          ownerId,
          sentAt: 200,
          surfacedTradeIds: [inboxTradeId],
          window: "late_morning",
        });
        await ctx.db.insert("checkIns", {
          date: "2026-05-15",
          kind: "mirror",
          ownerId,
          sentAt: 201,
          surfacedTradeIds: [inboxTradeId],
          window: "afternoon",
        });
      });

      const response = await t.fetch(
        "/internal/counterpart/fill-discussion-context",
        {
          body: JSON.stringify({ inboxTradeId }),
          headers: {
            authorization: "Bearer counterpart-test-token",
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        data: {
          checkIns: [
            { date: "2026-04-30", checkInId: expect.any(String) },
            { date: "2026-05-15", checkInId: expect.any(String) },
          ],
          evidenceWindow: {
            basis: "fill_date_to_today",
            endDate: "2026-05-15",
            startDate: "2026-04-30",
          },
          fill: { inboxTradeId, state: "pending" },
        },
        ok: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a bounded recent fallback for an undated pending fill", async () => {
    const discussionNow = Date.UTC(2026, 4, 15, 4, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(discussionNow);
    try {
      const inboxTradeId = await seedPendingTrade({ ticker: "GDX" });
      const checkIn = await t.mutation(internal.counterpart.createCheckIn, {
        date: "2026-05-15",
        kind: "mirror",
        ownerId,
        surfacedTradeIds: [inboxTradeId],
        window: "late_morning",
      });

      const response = await t.fetch(
        "/internal/counterpart/fill-discussion-context",
        {
          body: JSON.stringify({ inboxTradeId }),
          headers: {
            authorization: "Bearer counterpart-test-token",
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: {
          checkIns: [{ checkInId: checkIn.checkInId }],
          evidenceWindow: {
            basis: "recent_fallback",
            endDate: "2026-05-15",
            startDate: "2026-05-11",
          },
          fill: { inboxTradeId, state: "pending" },
        },
        ok: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns recent discussion evidence for a dismissed fill", async () => {
    const discussionNow = Date.UTC(2026, 4, 15, 4, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(discussionNow);
    try {
      const inboxTradeId = await seedPendingTrade({ date: 1, ticker: "GDX" });
      await t.mutation(internal.counterpart.createCheckIn, {
        date: "2026-05-15",
        kind: "mirror",
        ownerId,
        surfacedTradeIds: [inboxTradeId],
        window: "late_morning",
      });
      await t.run(async (ctx) => {
        await ctx.db.delete(inboxTradeId);
      });

      const response = await t.fetch(
        "/internal/counterpart/fill-discussion-context",
        {
          body: JSON.stringify({ inboxTradeId }),
          headers: {
            authorization: "Bearer counterpart-test-token",
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: {
          checkIns: [{ date: "2026-05-15" }],
          evidenceWindow: { basis: "recent_fallback" },
          fill: { state: "unknown" },
        },
        ok: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not expose a foreign owner's accepted receipt", async () => {
    const { foreignInboxTradeId, foreignTradeId } = await t.run(async (ctx) => {
      const foreignInboxTradeId = await ctx.db.insert("inboxTrades", {
        assetType: "stock",
        brokerageAccountId: "foreign-acct",
        date: 123,
        direction: "long",
        ownerId: "foreign-owner",
        price: 999,
        quantity: 77,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: "FOREIGN",
        validationErrors: [],
        validationWarnings: [],
      });
      const foreignTradeId = await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "foreign-acct",
        date: 123,
        direction: "long",
        ownerId: "foreign-owner",
        price: 999,
        quantity: 77,
        side: "buy",
        source: "ibkr",
        sourceInboxTradeId: foreignInboxTradeId,
        ticker: "FOREIGN",
      });
      return { foreignInboxTradeId, foreignTradeId };
    });

    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId: foreignInboxTradeId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Inbox trade not found",
        retryable: false,
      },
      ok: false,
    });
    expect(JSON.stringify(body)).not.toContain("FOREIGN");
    expect(JSON.stringify(body)).not.toContain(foreignTradeId);

    const discussion = await t.fetch(
      "/internal/counterpart/fill-discussion-context",
      {
        body: JSON.stringify({ inboxTradeId: foreignInboxTradeId }),
        headers: {
          authorization: "Bearer counterpart-test-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(await discussion.json()).toMatchObject({
      data: { fill: { state: "unknown" } },
      ok: true,
    });
  });

  it("does not false-match an accepted trade that predates receipt storage", async () => {
    const inboxTradeId = await seedPendingTrade({ date: 1 });
    await seedAcceptedTrade({
      date: 1,
      direction: "long",
      quantity: 1,
      side: "buy",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(inboxTradeId);
    });

    const response = await t.fetch("/internal/counterpart/accept-trade", {
      body: JSON.stringify({ inboxTradeId }),
      headers: {
        authorization: "Bearer counterpart-test-token",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
      ok: false,
    });
    const context = await t.fetch(
      "/internal/counterpart/fill-discussion-context",
      {
        body: JSON.stringify({ inboxTradeId }),
        headers: {
          authorization: "Bearer counterpart-test-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(await context.json()).toMatchObject({
      data: { checkIns: [], fill: { state: "unknown" } },
      ok: true,
    });
  });

  it("reports surfaced check-in evidence without deciding confirmation", async () => {
    const inboxTradeId = await seedPendingTrade({ date: 1, ticker: "GDX" });
    const noteId = await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        content: "Confirmed after discussing position sizing for GDX.",
        noteDate: 20,
        ownerId,
        ticker: "GDX",
      });
    });
    const answered = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [inboxTradeId],
      window: "late_morning",
    });
    await t.mutation(internal.counterpart.confirmCheckInDelivery, {
      checkInId: answered.checkInId,
      deliveredAt: 30,
      ownerId,
    });
    await t.mutation(internal.counterpart.recordCheckInResponse, {
      checkInId: answered.checkInId,
      noteIds: [noteId],
      ownerId,
      respondedAt: 40,
    });
    const unanswered = await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "mirror",
      ownerId,
      surfacedTradeIds: [inboxTradeId],
      window: "afternoon",
    });
    await t.mutation(internal.counterpart.createCheckIn, {
      date: "2026-05-15",
      kind: "briefing",
      ownerId,
      surfacedTradeIds: ["never-surfaced"],
      window: "end_of_day",
    });

    const response = await t.fetch(
      "/internal/counterpart/fill-discussion-context",
      {
        body: JSON.stringify({ inboxTradeId }),
        headers: {
          authorization: "Bearer counterpart-test-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        checkIns: [
          {
            checkInId: answered.checkInId,
            deliveredAt: 30,
            notes: [
              {
                contentPreview:
                  "Confirmed after discussing position sizing for GDX.",
                noteId,
                ticker: "GDX",
              },
            ],
            respondedAt: 40,
          },
          {
            checkInId: unanswered.checkInId,
            notes: [],
            respondedAt: null,
          },
        ],
        fill: { inboxTradeId, state: "pending", ticker: "GDX" },
      },
      ok: true,
    });
    expect(
      (body as { data: { checkIns: unknown[] } }).data.checkIns,
    ).toHaveLength(2);
  });

  it("rejects ownerId from the fill discussion request body", async () => {
    const response = await t.fetch(
      "/internal/counterpart/fill-discussion-context",
      {
        body: JSON.stringify({ inboxTradeId: "not-used", ownerId }),
        headers: {
          authorization: "Bearer counterpart-test-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION",
        message: "Unknown field: ownerId",
        retryable: false,
      },
      ok: false,
    });
  });
});
