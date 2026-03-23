// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("imports review workspace", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
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

    const workspace = await asUser(ownerA).query(
      api.imports.getImportsReviewWorkspace,
      {},
    );

    expect(workspace.summary.totalPendingCount).toBe(0);
    expect(workspace.referenceData.openTradePlans).toHaveLength(0);
    expect(workspace.rows).toEqual([]);
  });
});
