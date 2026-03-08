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

describe("navigation hierarchy", () => {
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
        closedAt: args.status === "closed" ? Date.now() : undefined,
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
        closedAt: args.status === "closed" ? Date.now() : undefined,
        instrumentSymbol: args.instrumentSymbol,
        name: args.name,
        ownerId: args.ownerId,
        status: args.status,
      });
    });
  }

  it("returns watched items, campaign rows, and standalone trade plans in navigation order", async () => {
    const watchedCampaignId = await insertCampaign({
      name: "Bravo Watched Campaign",
      ownerId: ownerA,
      status: "active",
    });
    const openCampaignId = await insertCampaign({
      name: "Alpha Open Campaign",
      ownerId: ownerA,
      status: "planning",
    });
    await insertCampaign({
      name: "Delta Closed Campaign",
      ownerId: ownerA,
      status: "closed",
    });

    const watchedChildId = await insertTradePlan({
      campaignId: watchedCampaignId,
      instrumentSymbol: "ZWC",
      name: "Zulu Watched Child",
      ownerId: ownerA,
      status: "active",
    });
    await insertTradePlan({
      campaignId: watchedCampaignId,
      instrumentSymbol: "AOC",
      name: "Alpha Open Child",
      ownerId: ownerA,
      status: "idea",
    });
    await insertTradePlan({
      campaignId: watchedCampaignId,
      instrumentSymbol: "BCC",
      name: "Bravo Closed Child",
      ownerId: ownerA,
      status: "closed",
    });
    await insertTradePlan({
      campaignId: openCampaignId,
      instrumentSymbol: "OSC",
      name: "Open Campaign Child",
      ownerId: ownerA,
      status: "watching",
    });

    const watchedStandaloneId = await insertTradePlan({
      instrumentSymbol: "CWS",
      name: "Charlie Watched Standalone",
      ownerId: ownerA,
      status: "closed",
    });
    await insertTradePlan({
      instrumentSymbol: "BOS",
      name: "Beta Open Standalone",
      ownerId: ownerA,
      status: "watching",
    });
    await insertTradePlan({
      instrumentSymbol: "ECS",
      name: "Echo Closed Standalone",
      ownerId: ownerA,
      status: "closed",
    });

    await insertCampaign({
      name: "Foreign Campaign",
      ownerId: ownerB,
      status: "active",
    });
    await insertTradePlan({
      instrumentSymbol: "FOR",
      name: "Foreign Trade Plan",
      ownerId: ownerB,
      status: "active",
    });

    const user = asUser(ownerA);

    await user.mutation(api.watchlist.watchItem, {
      item: { campaignId: watchedCampaignId, itemType: "campaign" },
    });
    await user.mutation(api.watchlist.watchItem, {
      item: { itemType: "tradePlan", tradePlanId: watchedChildId },
    });
    await user.mutation(api.watchlist.watchItem, {
      item: { itemType: "tradePlan", tradePlanId: watchedStandaloneId },
    });

    const hierarchy = await user.query(api.navigation.getCampaignTradePlanHierarchy);

    expect(hierarchy.watchlist).toMatchObject([
      {
        href: `/campaigns/${watchedCampaignId}`,
        id: watchedCampaignId,
        isWatched: true,
        itemType: "campaign",
        name: "Bravo Watched Campaign",
        status: "active",
      },
      {
        href: `/trade-plans/${watchedChildId}`,
        id: watchedChildId,
        instrumentSymbol: "ZWC",
        isWatched: true,
        itemType: "tradePlan",
        name: "Zulu Watched Child",
        parentCampaign: {
          id: watchedCampaignId,
          name: "Bravo Watched Campaign",
        },
        status: "active",
      },
      {
        href: `/trade-plans/${watchedStandaloneId}`,
        id: watchedStandaloneId,
        instrumentSymbol: "CWS",
        isWatched: true,
        itemType: "tradePlan",
        name: "Charlie Watched Standalone",
        parentCampaign: null,
        status: "closed",
      },
    ]);

    expect(hierarchy.campaigns.map((campaign) => campaign.name)).toEqual([
      "Bravo Watched Campaign",
      "Alpha Open Campaign",
      "Delta Closed Campaign",
    ]);

    expect(hierarchy.campaigns[0]).toMatchObject({
      defaultExpanded: true,
      href: `/campaigns/${watchedCampaignId}`,
      id: watchedCampaignId,
      isWatched: true,
      itemType: "campaign",
      name: "Bravo Watched Campaign",
      status: "active",
    });
    expect(hierarchy.campaigns[0].tradePlans).toMatchObject([
      {
        href: `/trade-plans/${watchedChildId}`,
        id: watchedChildId,
        instrumentSymbol: "ZWC",
        isWatched: true,
        itemType: "tradePlan",
        name: "Zulu Watched Child",
        parentCampaign: {
          href: `/campaigns/${watchedCampaignId}`,
          id: watchedCampaignId,
          name: "Bravo Watched Campaign",
        },
        status: "active",
      },
      {
        instrumentSymbol: "AOC",
        isWatched: false,
        name: "Alpha Open Child",
        status: "idea",
      },
      {
        instrumentSymbol: "BCC",
        isWatched: false,
        name: "Bravo Closed Child",
        status: "closed",
      },
    ]);

    expect(hierarchy.campaigns[1]).toMatchObject({
      defaultExpanded: false,
      id: openCampaignId,
      isWatched: false,
      name: "Alpha Open Campaign",
      status: "planning",
    });

    expect(hierarchy.standaloneTradePlans).toMatchObject([
      {
        href: `/trade-plans/${watchedStandaloneId}`,
        id: watchedStandaloneId,
        instrumentSymbol: "CWS",
        isWatched: true,
        itemType: "tradePlan",
        name: "Charlie Watched Standalone",
        parentCampaign: null,
        status: "closed",
      },
      {
        instrumentSymbol: "BOS",
        isWatched: false,
        name: "Beta Open Standalone",
        status: "watching",
      },
      {
        instrumentSymbol: "ECS",
        isWatched: false,
        name: "Echo Closed Standalone",
        status: "closed",
      },
    ]);
  });

  it("filters deleted watched campaigns and degrades orphaned linked trade plans into standalone items", async () => {
    const campaignId = await insertCampaign({
      name: "Soon Deleted Campaign",
      ownerId: ownerA,
      status: "active",
    });
    const orphanedTradePlanId = await insertTradePlan({
      campaignId,
      instrumentSymbol: "ORPH",
      name: "Orphaned Linked Plan",
      ownerId: ownerA,
      status: "active",
    });
    const user = asUser(ownerA);

    await user.mutation(api.watchlist.watchItem, {
      item: { campaignId, itemType: "campaign" },
    });
    await user.mutation(api.watchlist.watchItem, {
      item: { itemType: "tradePlan", tradePlanId: orphanedTradePlanId },
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(campaignId);
    });

    const hierarchy = await user.query(api.navigation.getCampaignTradePlanHierarchy);

    expect(hierarchy.campaigns).toEqual([]);
    expect(hierarchy.watchlist).toMatchObject([
      {
        href: `/trade-plans/${orphanedTradePlanId}`,
        id: orphanedTradePlanId,
        instrumentSymbol: "ORPH",
        isWatched: true,
        itemType: "tradePlan",
        name: "Orphaned Linked Plan",
        parentCampaign: null,
        status: "active",
      },
    ]);
    expect(hierarchy.standaloneTradePlans).toMatchObject([
      {
        href: `/trade-plans/${orphanedTradePlanId}`,
        id: orphanedTradePlanId,
        instrumentSymbol: "ORPH",
        isWatched: true,
        itemType: "tradePlan",
        name: "Orphaned Linked Plan",
        parentCampaign: null,
        status: "active",
      },
    ]);
  });
});
