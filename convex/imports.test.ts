// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

function stubTwelveDataResolutionFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const parsed = new URL(url);
      const symbol = parsed.searchParams.get("symbol")?.toUpperCase() ?? "";
      return new Response(
        JSON.stringify({
          data: [
            {
              country: "United States",
              currency: "USD",
              exchange: "NASDAQ",
              instrument_type: "Common Stock",
              symbol,
            },
          ],
          status: "ok",
        }),
        { status: 200 },
      );
    }),
  );
}

describe("imports review workspace", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
    process.env.TWELVE_DATA_API_KEY = "test-key";
    stubTwelveDataResolutionFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWELVE_DATA_API_KEY;
  });

  function asUser(ownerId: string) {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertCampaign(args: {
    name: string;
    ownerId: string;
    status: "active" | "closed" | "planning";
  }): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        name: args.name,
        ownerId: args.ownerId,
        status: args.status,
        thesis: `${args.name} thesis`,
      });
    });
  }

  async function insertTradePlan(args: {
    campaignId?: Id<"campaigns">;
    instrumentSymbol: string;
    name: string;
    ownerId: string;
    status: "active" | "closed" | "idea" | "watching";
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        campaignId: args.campaignId,
        instrumentSymbol: args.instrumentSymbol,
        name: args.name,
        ownerId: args.ownerId,
        status: args.status,
      });
    });
  }

  async function insertPortfolio(args: {
    name: string;
    ownerId: string;
  }): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", args);
    });
  }

  async function insertTrade(args: {
    ownerId: string;
    portfolioId?: Id<"portfolios">;
    ticker: string;
  }) {
    await t.run(async (ctx) => {
      await ctx.db.insert("trades", {
        assetType: "stock",
        date: 100,
        direction: "long",
        ownerId: args.ownerId,
        portfolioId: args.portfolioId,
        price: 10,
        quantity: 1,
        side: "buy",
        source: "manual",
        ticker: args.ticker,
      });
    });
  }

  async function insertAccountMapping(args: {
    accountId: string;
    friendlyName: string;
    ownerId: string;
    source: "ibkr" | "kraken";
  }) {
    await t.run(async (ctx) => {
      await ctx.db.insert("accountMappings", args);
    });
  }

  async function insertResolvedInstrument(args: {
    assetType: "crypto" | "stock";
    ownerId: string;
    symbol: string;
  }) {
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("marketDataInstruments", {
        assetType: args.assetType,
        createdAt: now,
        ownerId: args.ownerId,
        provider: "twelve_data",
        providerSymbol: args.symbol,
        resolutionStatus: "resolved",
        symbol: args.symbol,
        updatedAt: now,
      });
    });
  }

  it("stages manual CSV imports for review", async () => {
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "AAPL",
    });

    const result = await asUser(ownerA).mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          date: 1_771_597_800_000,
          direction: "long",
          externalId: "manual-aapl-1",
          brokerageAccountId: "Main Account",
          price: 200,
          quantity: 3,
          side: "buy",
          source: "manual",
          ticker: "aapl",
        },
      ],
    });

    await t.finishInProgressScheduledFunctions();

    const knownAccounts = await asUser(ownerA).query(
      api.accountMappings.listKnownBrokerageAccounts,
      {},
    );
    const mappingId = await asUser(ownerA).mutation(
      api.accountMappings.upsertAccountMapping,
      {
        accountId: "Main Account",
        friendlyName: "Main Trading Account",
        source: "manual",
      },
    );
    const mappings = await asUser(ownerA).query(
      api.accountMappings.listAccountMappings,
      {},
    );
    const inboxTrades = await asUser(ownerA).query(
      api.imports.listInboxTrades,
      {},
    );

    expect(result).toEqual({
      imported: 1,
      skippedDuplicates: 0,
      withValidationErrors: 0,
      withWarnings: 0,
    });
    expect(inboxTrades).toHaveLength(1);
    expect(inboxTrades[0]).toMatchObject({
      brokerageAccountId: "Main Account",
      externalId: "manual-aapl-1",
      source: "manual",
      ticker: "AAPL",
    });
    expect(knownAccounts).toEqual([
      expect.objectContaining({
        accountId: "Main Account",
        inboxTradeCount: 1,
        source: "manual",
        tradeCount: 0,
      }),
    ]);
    expect(mappings).toEqual([
      expect.objectContaining({
        _id: mappingId,
        accountId: "Main Account",
        friendlyName: "Main Trading Account",
        source: "manual",
      }),
    ]);
  });

  it("skips duplicate manual external ids", async () => {
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "AAPL",
    });

    const trade = {
      assetType: "stock" as const,
      date: 1_771_597_800_000,
      direction: "long" as const,
      externalId: "manual-duplicate-1",
      price: 200,
      quantity: 3,
      side: "buy" as const,
      source: "manual" as const,
      ticker: "AAPL",
    };

    await asUser(ownerA).mutation(api.imports.importTrades, {
      trades: [trade],
    });
    const result = await asUser(ownerA).mutation(api.imports.importTrades, {
      trades: [trade],
    });

    const inboxTrades = await asUser(ownerA).query(
      api.imports.listInboxTrades,
      {},
    );

    expect(result).toEqual({
      imported: 0,
      skippedDuplicates: 1,
      withValidationErrors: 0,
      withWarnings: 0,
    });
    expect(inboxTrades).toHaveLength(1);
  });

  it("includes manual accounts from accepted trades in known accounts", async () => {
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "AAPL",
    });

    const importResult = await asUser(ownerA).mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          brokerageAccountId: "Manual Ledger",
          date: 1_771_597_800_000,
          direction: "long",
          externalId: "manual-accepted-1",
          price: 200,
          quantity: 3,
          side: "buy",
          source: "manual",
          ticker: "AAPL",
        },
      ],
    });

    const inboxTrades = await asUser(ownerA).query(api.imports.listInboxTrades, {});
    expect(importResult.imported).toBe(1);
    expect(inboxTrades).toHaveLength(1);

    const accepted = await asUser(ownerA).action(api.imports.acceptTrade, {
      inboxTradeId: inboxTrades[0]._id,
    });
    expect(accepted.accepted).toBe(true);

    const knownAccounts = await asUser(ownerA).query(
      api.accountMappings.listKnownBrokerageAccounts,
      {},
    );

    expect(knownAccounts).toEqual([
      expect.objectContaining({
        accountId: "Manual Ledger",
        inboxTradeCount: 0,
        source: "manual",
        tradeCount: 1,
      }),
    ]);
  });

  it("returns reference data and explicit review states for pending inbox rows", async () => {
    const activeCampaignId = await insertCampaign({
      name: "Semis",
      ownerId: ownerA,
      status: "active",
    });
    await insertCampaign({
      name: "Old Theme",
      ownerId: ownerA,
      status: "closed",
    });
    const planningCampaignId = await insertCampaign({
      name: "Energy Watch",
      ownerId: ownerA,
      status: "planning",
    });
    const assignedPlanId = await insertTradePlan({
      campaignId: activeCampaignId,
      instrumentSymbol: "NVDA",
      name: "NVDA momentum",
      ownerId: ownerA,
      status: "active",
    });
    await insertTradePlan({
      campaignId: planningCampaignId,
      instrumentSymbol: "TSLA",
      name: "TSLA base",
      ownerId: ownerA,
      status: "watching",
    });
    const portfolioId = await insertPortfolio({
      name: "Swing",
      ownerId: ownerA,
    });
    await insertTrade({
      ownerId: ownerA,
      portfolioId,
      ticker: "NVDA",
    });
    await insertAccountMapping({
      accountId: "ACC-1",
      friendlyName: "Primary IBKR",
      ownerId: ownerA,
      source: "ibkr",
    });
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "NVDA",
    });
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "MSFT",
    });

    await asUser(ownerA).mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          brokerageAccountId: "ACC-1",
          date: 1_700_000_000_000,
          direction: "long",
          price: 101,
          quantity: 2,
          side: "buy",
          source: "ibkr",
          ticker: "NVDA",
        },
        {
          assetType: "stock",
          date: 1_699_000_000_000,
          direction: "long",
          price: 50,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "MSFT",
          validationWarnings: ["warning from parser"],
        },
      ],
    });

    await t.finishInProgressScheduledFunctions();

    const workspace = await asUser(ownerA).query(
      api.imports.getImportsReviewWorkspace,
      {},
    );

    expect(workspace.summary).toEqual({
      ambiguousCount: 0,
      assignedCount: 1,
      errorCount: 0,
      needsReviewCount: 0,
      readyCount: 2,
      suggestedCount: 0,
      totalPendingCount: 2,
      unmatchedCount: 1,
      validCount: 0,
      warningCount: 2,
    });
    expect(workspace.referenceData.accountMappings).toHaveLength(1);
    expect(workspace.referenceData.accountMappings[0].friendlyName).toBe(
      "Primary IBKR",
    );
    expect(workspace.referenceData.portfolios).toEqual([
      expect.objectContaining({
        _id: portfolioId,
        name: "Swing",
        tradeCount: 1,
      }),
    ]);
    expect(
      workspace.referenceData.campaigns.map(
        (campaign: (typeof workspace.referenceData.campaigns)[number]) =>
          campaign.status,
      ),
    ).toEqual(["planning", "active"]);
    expect(
      workspace.referenceData.openTradePlans.map(
        (plan: (typeof workspace.referenceData.openTradePlans)[number]) =>
          plan._id,
      ),
    ).toContain(assignedPlanId);
    expect(workspace.rows[0]).toMatchObject({
      matchContext: {
        assignedTradePlan: {
          _id: assignedPlanId,
          name: "NVDA momentum",
        },
        candidateCount: 1,
        ticker: "NVDA",
      },
      matchState: "assigned",
      readiness: {
        isReady: true,
        missingFields: [],
      },
      reviewState: "ready",
      validationState: "warning",
    });
    expect(workspace.rows[1]).toMatchObject({
      matchContext: {
        assignedTradePlan: null,
        candidateCount: 0,
        ticker: "MSFT",
      },
      matchState: "unmatched",
      readiness: {
        isReady: true,
        missingFields: [],
      },
      reviewState: "ready",
      validationState: "warning",
    });
  });

  it("marks ambiguous and needs-review rows explicitly", async () => {
    await insertTradePlan({
      instrumentSymbol: "AAPL",
      name: "AAPL breakout",
      ownerId: ownerA,
      status: "active",
    });
    await insertTradePlan({
      instrumentSymbol: "AAPL",
      name: "AAPL pullback",
      ownerId: ownerA,
      status: "watching",
    });
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "AAPL",
    });
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerA,
      symbol: "SHOP",
    });

    await asUser(ownerA).mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          date: 1_700_000_000_000,
          direction: "long",
          price: 20,
          quantity: 3,
          side: "buy",
          source: "ibkr",
          ticker: "AAPL",
        },
        {
          assetType: "stock",
          date: 1_700_000_000_000,
          direction: "long",
          price: 0,
          quantity: 3,
          side: "buy",
          source: "ibkr",
          ticker: "SHOP",
        },
      ],
    });

    await t.finishInProgressScheduledFunctions();

    const workspace = await asUser(ownerA).query(
      api.imports.getImportsReviewWorkspace,
      {},
    );

    expect(workspace.summary).toEqual({
      ambiguousCount: 1,
      assignedCount: 0,
      errorCount: 1,
      needsReviewCount: 1,
      readyCount: 1,
      suggestedCount: 0,
      totalPendingCount: 2,
      unmatchedCount: 1,
      validCount: 0,
      warningCount: 1,
    });
    expect(workspace.rows[0]).toMatchObject({
      matchState: "ambiguous",
      matchContext: {
        assignedTradePlan: null,
        candidateCount: 2,
      },
      readiness: {
        isReady: true,
        missingFields: [],
      },
      reviewState: "ready",
      validationState: "warning",
    });
    expect(workspace.rows[0].matchContext.suggestedTradePlans).toHaveLength(2);
    expect(workspace.rows[1]).toMatchObject({
      matchState: "unmatched",
      readiness: {
        isReady: false,
        missingFields: ["price"],
      },
      reviewState: "needs_review",
      validationState: "error",
    });
  });

  it("scopes the workspace to the authenticated owner", async () => {
    await insertTradePlan({
      instrumentSymbol: "META",
      name: "META plan",
      ownerId: ownerB,
      status: "active",
    });
    await insertResolvedInstrument({
      assetType: "stock",
      ownerId: ownerB,
      symbol: "META",
    });
    await asUser(ownerB).mutation(api.imports.importTrades, {
      trades: [
        {
          assetType: "stock",
          date: 1_700_000_000_000,
          direction: "long",
          price: 20,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "META",
        },
      ],
    });

    await t.finishInProgressScheduledFunctions();

    const workspace = await asUser(ownerA).query(
      api.imports.getImportsReviewWorkspace,
      {},
    );

    expect(workspace.summary.totalPendingCount).toBe(0);
    expect(workspace.referenceData.openTradePlans).toHaveLength(0);
    expect(workspace.rows).toEqual([]);
  });
});
