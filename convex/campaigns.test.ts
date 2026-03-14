// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob("./**/*.*s");

describe("campaign workspace queries", () => {
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
    closedAt?: number;
    name: string;
    ownerId: string;
    retrospective?: string;
    status: "active" | "closed" | "planning";
    thesis?: string;
  }): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        closedAt: args.closedAt,
        name: args.name,
        ownerId: args.ownerId,
        retrospective: args.retrospective,
        status: args.status,
        thesis: args.thesis ?? `${args.name} thesis`,
      });
    });
  }

  async function insertTradePlan(args: {
    campaignId?: Id<"campaigns">;
    closedAt?: number;
    instrumentSymbol: string;
    invalidatedAt?: number;
    name: string;
    ownerId: string;
    sortOrder?: number;
    status: "active" | "closed" | "idea" | "watching";
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        campaignId: args.campaignId,
        closedAt: args.closedAt,
        instrumentSymbol: args.instrumentSymbol,
        invalidatedAt: args.invalidatedAt,
        name: args.name,
        ownerId: args.ownerId,
        sortOrder: args.sortOrder,
        status: args.status,
      });
    });
  }

  async function insertTrade(args: {
    date: number;
    ownerId: string;
    ticker: string;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        date: args.date,
        direction: "long",
        ownerId: args.ownerId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: "manual",
        ticker: args.ticker,
        tradePlanId: args.tradePlanId,
      });
    });
  }

  it("returns an empty list when the user has no campaigns", async () => {
    const user = asUser(ownerA);

    await expect(
      user.query(api.campaigns.listCampaignWorkspaceSummaries, {}),
    ).resolves.toEqual([]);
  });

  it("returns empty rollups for campaigns with no linked plans or trades", async () => {
    const campaignId = await insertCampaign({
      name: "Fresh Campaign",
      ownerId: ownerA,
      status: "planning",
    });

    const user = asUser(ownerA);
    const summaries = await user.query(api.campaigns.listCampaignWorkspaceSummaries, {});
    const detail = await user.query(api.campaigns.getCampaignWorkspace, { campaignId });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: campaignId,
      isWatched: false,
      lifecycle: {
        closedAt: null,
        hasClosedTradePlans: false,
        hasLinkedTradePlans: false,
        hasOpenTradePlans: false,
        hasRetrospective: false,
        isClosed: false,
      },
      linkedTradePlans: {
        activeCount: 0,
        closedCount: 0,
        ideaCount: 0,
        openCount: 0,
        totalCount: 0,
        watchingCount: 0,
      },
      linkedTrades: {
        latestTradeDate: null,
        totalCount: 0,
      },
      name: "Fresh Campaign",
      status: "planning",
    });

    expect(detail).toEqual({
      linkedTradePlans: [],
      summary: summaries[0],
    });
  });

  it("surfaces closed-campaign lifecycle metadata and watched state", async () => {
    const closedAt = Date.UTC(2026, 2, 11);
    const tradeDate = Date.UTC(2026, 2, 10);
    const openCampaignId = await insertCampaign({
      name: "Still Open Campaign",
      ownerId: ownerA,
      status: "active",
    });
    const campaignId = await insertCampaign({
      closedAt,
      name: "Finished Campaign",
      ownerId: ownerA,
      retrospective: "Documented what worked",
      status: "closed",
    });
    const linkedTradePlanId = await insertTradePlan({
      campaignId,
      closedAt,
      instrumentSymbol: "NVDA",
      name: "Closed Linked Plan",
      ownerId: ownerA,
      status: "closed",
    });
    await insertTrade({
      date: tradeDate,
      ownerId: ownerA,
      ticker: "NVDA",
      tradePlanId: linkedTradePlanId,
    });

    const user = asUser(ownerA);
    await user.mutation(api.watchlist.watchItem, {
      item: { campaignId, itemType: "campaign" },
    });

    const summaries = await user.query(api.campaigns.listCampaignWorkspaceSummaries, {
      status: "closed",
    });
    const detail = await user.query(api.campaigns.getCampaignWorkspace, { campaignId });
    const openCampaignDetail = await user.query(api.campaigns.getCampaignWorkspace, {
      campaignId: openCampaignId,
    });

    expect(summaries).toHaveLength(1);
    expect(summaries.map((summary) => summary.id)).not.toContain(openCampaignId);
    expect(summaries[0]).toMatchObject({
      id: campaignId,
      isWatched: true,
      lifecycle: {
        closedAt,
        hasClosedTradePlans: true,
        hasLinkedTradePlans: true,
        hasOpenTradePlans: false,
        hasRetrospective: true,
        isClosed: true,
      },
      linkedTradePlans: {
        activeCount: 0,
        closedCount: 1,
        ideaCount: 0,
        openCount: 0,
        totalCount: 1,
        watchingCount: 0,
      },
      linkedTrades: {
        latestTradeDate: tradeDate,
        totalCount: 1,
      },
      status: "closed",
    });

    expect(openCampaignDetail?.summary.status).toBe("active");

    expect(detail).toMatchObject({
      linkedTradePlans: [
        {
          closedAt,
          id: linkedTradePlanId,
          instrumentSymbol: "NVDA",
          invalidatedAt: null,
          isWatched: false,
          latestTradeDate: tradeDate,
          name: "Closed Linked Plan",
          status: "closed",
          tradeCount: 1,
        },
      ],
      summary: summaries[0],
    });
  });

  it("rolls up mixed linked-plan statuses and linked trade counts without leaking foreign data", async () => {
    const campaignId = await insertCampaign({
      name: "Mixed Campaign",
      ownerId: ownerA,
      status: "active",
    });
    const ideaPlanId = await insertTradePlan({
      campaignId,
      instrumentSymbol: "AAPL",
      name: "Idea Plan",
      ownerId: ownerA,
      sortOrder: 1,
      status: "idea",
    });
    const watchingPlanId = await insertTradePlan({
      campaignId,
      instrumentSymbol: "MSFT",
      name: "Watching Plan",
      ownerId: ownerA,
      sortOrder: 2,
      status: "watching",
    });
    const activePlanId = await insertTradePlan({
      campaignId,
      instrumentSymbol: "TSLA",
      name: "Active Plan",
      ownerId: ownerA,
      sortOrder: 3,
      status: "active",
    });
    const closedPlanId = await insertTradePlan({
      campaignId,
      closedAt: Date.UTC(2026, 2, 9),
      instrumentSymbol: "AMD",
      name: "Closed Plan",
      ownerId: ownerA,
      sortOrder: 4,
      status: "closed",
    });

    await insertTrade({
      date: Date.UTC(2026, 2, 7),
      ownerId: ownerA,
      ticker: "TSLA",
      tradePlanId: activePlanId,
    });
    await insertTrade({
      date: Date.UTC(2026, 2, 12),
      ownerId: ownerA,
      ticker: "TSLA",
      tradePlanId: activePlanId,
    });
    await insertTrade({
      date: Date.UTC(2026, 2, 8),
      ownerId: ownerA,
      ticker: "AMD",
      tradePlanId: closedPlanId,
    });

    const foreignCampaignId = await insertCampaign({
      name: "Foreign Campaign",
      ownerId: ownerB,
      status: "active",
    });
    const foreignPlanId = await insertTradePlan({
      campaignId: foreignCampaignId,
      instrumentSymbol: "META",
      name: "Foreign Plan",
      ownerId: ownerB,
      status: "active",
    });
    await insertTrade({
      date: Date.UTC(2026, 2, 13),
      ownerId: ownerB,
      ticker: "META",
      tradePlanId: foreignPlanId,
    });

    const user = asUser(ownerA);
    await user.mutation(api.watchlist.watchItem, {
      item: { itemType: "tradePlan", tradePlanId: watchingPlanId },
    });

    const summaries = await user.query(api.campaigns.listCampaignWorkspaceSummaries, {});
    const detail = await user.query(api.campaigns.getCampaignWorkspace, { campaignId });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: campaignId,
      isWatched: false,
      lifecycle: {
        closedAt: null,
        hasClosedTradePlans: true,
        hasLinkedTradePlans: true,
        hasOpenTradePlans: true,
        hasRetrospective: false,
        isClosed: false,
      },
      linkedTradePlans: {
        activeCount: 1,
        closedCount: 1,
        ideaCount: 1,
        openCount: 3,
        totalCount: 4,
        watchingCount: 1,
      },
      linkedTrades: {
        latestTradeDate: Date.UTC(2026, 2, 12),
        totalCount: 3,
      },
      name: "Mixed Campaign",
      status: "active",
    });

    expect(detail).toMatchObject({
      linkedTradePlans: [
        {
          id: ideaPlanId,
          isWatched: false,
          name: "Idea Plan",
          status: "idea",
          tradeCount: 0,
        },
        {
          id: watchingPlanId,
          isWatched: true,
          name: "Watching Plan",
          status: "watching",
          tradeCount: 0,
        },
        {
          id: activePlanId,
          isWatched: false,
          latestTradeDate: Date.UTC(2026, 2, 12),
          name: "Active Plan",
          status: "active",
          tradeCount: 2,
        },
        {
          id: closedPlanId,
          isWatched: false,
          latestTradeDate: Date.UTC(2026, 2, 8),
          name: "Closed Plan",
          status: "closed",
          tradeCount: 1,
        },
      ],
      summary: summaries[0],
    });
  });
});
