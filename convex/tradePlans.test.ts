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

describe("trade plan workspace queries", () => {
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
    closedAt?: number;
    entryConditions?: string;
    exitConditions?: string;
    instrumentSymbol: string;
    name: string;
    ownerId: string;
    rationale?: string;
    sortOrder?: number;
    status: "active" | "closed" | "idea" | "watching";
    targetConditions?: string;
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        campaignId: args.campaignId,
        closedAt: args.closedAt,
        entryConditions: args.entryConditions,
        exitConditions: args.exitConditions,
        instrumentSymbol: args.instrumentSymbol,
        name: args.name,
        ownerId: args.ownerId,
        rationale: args.rationale,
        sortOrder: args.sortOrder,
        status: args.status,
        targetConditions: args.targetConditions,
      });
    });
  }

  async function insertTrade(args: {
    brokerageAccountId?: string;
    date: number;
    ownerId: string;
    portfolioId?: Id<"portfolios">;
    ticker: string;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: args.brokerageAccountId,
        date: args.date,
        direction: "long",
        ownerId: args.ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: "manual",
        ticker: args.ticker,
        tradePlanId: args.tradePlanId,
      });
    });
  }

  async function insertInboxTrade(args: {
    date?: number;
    ownerId: string;
    ticker?: string;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"inboxTrades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("inboxTrades", {
        date: args.date,
        direction: "long",
        ownerId: args.ownerId,
        price: 101,
        quantity: 2,
        side: "buy",
        source: "ibkr",
        status: "pending_review",
        ticker: args.ticker,
        tradePlanId: args.tradePlanId,
        validationErrors: [],
        validationWarnings: [],
      });
    });
  }

  async function insertNote(args: {
    content: string;
    ownerId: string;
    tradePlanId: Id<"tradePlans">;
  }): Promise<Id<"notes">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        content: args.content,
        ownerId: args.ownerId,
        tradePlanId: args.tradePlanId,
      });
    });
  }

  async function insertWatch(tradePlanId: Id<"tradePlans">, ownerId: string) {
    await t.run(async (ctx) => {
      await ctx.db.insert("watchlist", {
        itemType: "tradePlan",
        ownerId,
        tradePlanId,
        watchedAt: Date.now(),
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

  async function insertPortfolio(args: {
    name: string;
    ownerId: string;
  }): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", args);
    });
  }

  it("lists workspace summaries with relationship, watch, and execution rollups", async () => {
    const campaignId = await insertCampaign({
      name: "Commodity Run Up",
      ownerId: ownerA,
      status: "active",
    });
    const linkedPlanId = await insertTradePlan({
      campaignId,
      instrumentSymbol: "URNM",
      name: "URNM breakout",
      ownerId: ownerA,
      sortOrder: 2,
      status: "active",
    });
    const standalonePlanId = await insertTradePlan({
      instrumentSymbol: "ARKK",
      name: "Short ARKK",
      ownerId: ownerA,
      sortOrder: 1,
      status: "watching",
    });
    await insertTrade({
      date: 100,
      ownerId: ownerA,
      ticker: "ARKK",
      tradePlanId: standalonePlanId,
    });
    await insertTrade({
      date: 200,
      ownerId: ownerA,
      ticker: "URNM",
      tradePlanId: linkedPlanId,
    });
    await insertInboxTrade({
      date: 300,
      ownerId: ownerA,
      ticker: "ARKK",
      tradePlanId: standalonePlanId,
    });
    await insertInboxTrade({
      date: 250,
      ownerId: ownerA,
      ticker: "ARKK",
    });
    await insertWatch(standalonePlanId, ownerA);

    const summaries = await asUser(ownerA).query(
      api.tradePlans.listTradePlanWorkspaceSummaries,
      {},
    );

    expect(summaries).toHaveLength(2);
    expect(
      summaries.map(
        (summary: (typeof summaries)[number]) => summary.id,
      ),
    ).toEqual([
      standalonePlanId,
      linkedPlanId,
    ]);
    expect(summaries[0]).toMatchObject({
      id: standalonePlanId,
      instrumentSymbol: "ARKK",
      isWatched: true,
      relationship: {
        kind: "standalone",
        parentCampaign: null,
      },
      execution: {
        latestTradeDate: 100,
        pendingAssignedCount: 1,
        pendingSuggestedCount: 1,
        totalPendingCount: 2,
        tradeCount: 1,
      },
      lifecycle: {
        closedAt: null,
        isClosed: false,
      },
      status: "watching",
    });
    expect(summaries[1]).toMatchObject({
      id: linkedPlanId,
      relationship: {
        kind: "linked",
        parentCampaign: {
          id: campaignId,
          name: "Commodity Run Up",
          href: `/campaigns/${campaignId}`,
        },
      },
      execution: {
        latestTradeDate: 200,
        pendingAssignedCount: 0,
        pendingSuggestedCount: 0,
        totalPendingCount: 0,
        tradeCount: 1,
      },
      isWatched: false,
      status: "active",
    });
  });

  it("filters workspace summaries by lifecycle status", async () => {
    await insertTradePlan({
      instrumentSymbol: "MSFT",
      name: "Closed Plan",
      ownerId: ownerA,
      status: "closed",
    });
    await insertTradePlan({
      instrumentSymbol: "TSLA",
      name: "Open Plan",
      ownerId: ownerA,
      status: "idea",
    });

    const closedSummaries = await asUser(ownerA).query(
      api.tradePlans.listTradePlanWorkspaceSummaries,
      { status: "closed" },
    );

    expect(closedSummaries).toHaveLength(1);
    expect(closedSummaries[0].status).toBe("closed");
    expect(closedSummaries[0].name).toBe("Closed Plan");
  });

  it("returns the aggregated detail workspace payload", async () => {
    const campaignId = await insertCampaign({
      name: "Semis",
      ownerId: ownerA,
      status: "active",
    });
    const portfolioId = await insertPortfolio({
      name: "Swing",
      ownerId: ownerA,
    });
    const tradePlanId = await insertTradePlan({
      campaignId,
      entryConditions: "Break prior high",
      exitConditions: "Lose trend",
      instrumentSymbol: "NVDA",
      name: "NVDA momentum",
      ownerId: ownerA,
      rationale: "Lead AI name with relative strength",
      status: "active",
      targetConditions: "Tag extension level",
    });
    await insertNote({
      content: "Initial plan note",
      ownerId: ownerA,
      tradePlanId,
    });
    await insertTrade({
      brokerageAccountId: "ACC-1",
      date: 400,
      ownerId: ownerA,
      portfolioId,
      ticker: "NVDA",
      tradePlanId,
    });
    await insertAccountMapping({
      accountId: "ACC-1",
      friendlyName: "Primary IBKR",
      ownerId: ownerA,
      source: "ibkr",
    });
    await insertInboxTrade({
      date: 500,
      ownerId: ownerA,
      ticker: "NVDA",
      tradePlanId,
    });
    await insertInboxTrade({
      date: 450,
      ownerId: ownerA,
      ticker: "NVDA",
    });
    await insertWatch(tradePlanId, ownerA);

    const detail = await asUser(ownerA).query(
      api.tradePlans.getTradePlanWorkspace,
      { tradePlanId },
    );

    expect(detail).not.toBeNull();
    expect(detail?.summary).toMatchObject({
      id: tradePlanId,
      instrumentSymbol: "NVDA",
      isWatched: true,
      relationship: {
        kind: "linked",
        parentCampaign: {
          id: campaignId,
          name: "Semis",
        },
      },
      execution: {
        latestTradeDate: 400,
        pendingAssignedCount: 1,
        pendingSuggestedCount: 1,
        totalPendingCount: 2,
        tradeCount: 1,
      },
    });
    expect(detail?.tradePlan).toEqual({
      campaignId,
      closedAt: null,
      entryConditions: "Break prior high",
      exitConditions: "Lose trend",
      id: tradePlanId,
      instrumentSymbol: "NVDA",
      name: "NVDA momentum",
      rationale: "Lead AI name with relative strength",
      status: "active",
      targetConditions: "Tag extension level",
    });
    expect(detail?.notes).toHaveLength(1);
    expect(detail?.notes[0]).toMatchObject({
      content: "Initial plan note",
      contextHref: `/trade-plans/${tradePlanId}`,
      contextKind: "tradePlan",
      contextLabel: "NVDA momentum",
    });
    expect(detail?.trades).toHaveLength(1);
    expect(detail?.trades[0]).toMatchObject({
      brokerageAccountId: "ACC-1",
      portfolioId,
      ticker: "NVDA",
      tradePlanId,
    });
    expect(detail?.accountMappings).toHaveLength(1);
    expect(detail?.accountMappings[0].friendlyName).toBe("Primary IBKR");
    expect(detail?.portfolios).toHaveLength(1);
    expect(detail?.portfolios[0].name).toBe("Swing");
    expect(
      detail?.inboxTrades.map(
        (item: NonNullable<typeof detail>["inboxTrades"][number]) =>
          item.matchType,
      ),
    ).toEqual(["assigned", "suggested"]);
  });

  it("keeps detail workspace rollups scoped to the requested plan", async () => {
    const campaignId = await insertCampaign({
      name: "Growth",
      ownerId: ownerA,
      status: "active",
    });
    const requestedPlanId = await insertTradePlan({
      campaignId,
      instrumentSymbol: "NVDA",
      name: "NVDA detail",
      ownerId: ownerA,
      status: "active",
    });
    const otherPlanId = await insertTradePlan({
      instrumentSymbol: "AMD",
      name: "AMD noise",
      ownerId: ownerA,
      status: "watching",
    });

    await insertTrade({
      date: 400,
      ownerId: ownerA,
      ticker: "NVDA",
      tradePlanId: requestedPlanId,
    });
    await insertTrade({
      date: 999,
      ownerId: ownerA,
      ticker: "AMD",
      tradePlanId: otherPlanId,
    });
    await insertInboxTrade({
      date: 500,
      ownerId: ownerA,
      ticker: "NVDA",
      tradePlanId: requestedPlanId,
    });
    await insertInboxTrade({
      date: 450,
      ownerId: ownerA,
      ticker: "NVDA",
    });
    await insertInboxTrade({
      date: 600,
      ownerId: ownerA,
      ticker: "AMD",
      tradePlanId: otherPlanId,
    });
    await insertWatch(requestedPlanId, ownerA);
    await insertWatch(otherPlanId, ownerA);

    const detail = await asUser(ownerA).query(
      api.tradePlans.getTradePlanWorkspace,
      { tradePlanId: requestedPlanId },
    );

    expect(detail).not.toBeNull();
    expect(detail?.summary).toMatchObject({
      id: requestedPlanId,
      execution: {
        latestTradeDate: 400,
        pendingAssignedCount: 1,
        pendingSuggestedCount: 1,
        totalPendingCount: 2,
        tradeCount: 1,
      },
      isWatched: true,
      relationship: {
        kind: "linked",
        parentCampaign: {
          id: campaignId,
          name: "Growth",
        },
      },
    });
  });

  it("returns null when the workspace trade plan is missing or belongs to another owner", async () => {
    const ownerBPlanId = await insertTradePlan({
      instrumentSymbol: "BTC",
      name: "Other owner plan",
      ownerId: ownerB,
      status: "idea",
    });

    await expect(
      asUser(ownerA).query(api.tradePlans.getTradePlanWorkspace, {
        tradePlanId: ownerBPlanId,
      }),
    ).resolves.toBeNull();
  });
});
