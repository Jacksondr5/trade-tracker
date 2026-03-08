// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob("./**/*.*s");

describe("watchlist", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  function asUser(ownerId: string) {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertCampaign(
    ownerId: string,
    status: "active" | "closed" | "planning",
  ): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        closedAt: status === "closed" ? Date.now() : undefined,
        name: `${ownerId} campaign`,
        ownerId,
        status,
        thesis: "Campaign thesis",
      });
    });
  }

  async function insertTradePlan(args: {
    campaignId?: Id<"campaigns">;
    ownerId: string;
    status: "active" | "closed" | "idea" | "watching";
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        campaignId: args.campaignId,
        closedAt: args.status === "closed" ? Date.now() : undefined,
        instrumentSymbol: "AAPL",
        name: `${args.ownerId} trade plan`,
        ownerId: args.ownerId,
        status: args.status,
      });
    });
  }

  it("watches and unwatches campaigns", async () => {
    const campaignId = await insertCampaign(ownerA, "planning");
    const user = asUser(ownerA);

    const watchId = await user.mutation(api.watchlist.watchItem, {
      item: {
        campaignId,
        itemType: "campaign",
      },
    });

    await expect(user.query(api.watchlist.listWatchedItems)).resolves.toMatchObject([
      {
        _id: watchId,
        campaignId,
        itemType: "campaign",
        ownerId: ownerA,
      },
    ]);

    await expect(
      user.mutation(api.watchlist.unwatchItem, {
        item: {
          campaignId,
          itemType: "campaign",
        },
      }),
    ).resolves.toBeNull();

    await expect(user.query(api.watchlist.listWatchedItems)).resolves.toEqual([]);
  });

  it("supports watched state independently from lifecycle status", async () => {
    const closedCampaignId = await insertCampaign(ownerA, "closed");
    const closedTradePlanId = await insertTradePlan({
      ownerId: ownerA,
      status: "closed",
    });
    const user = asUser(ownerA);

    await user.mutation(api.watchlist.watchItem, {
      item: {
        campaignId: closedCampaignId,
        itemType: "campaign",
      },
    });
    await user.mutation(api.watchlist.watchItem, {
      item: {
        itemType: "tradePlan",
        tradePlanId: closedTradePlanId,
      },
    });

    await expect(user.query(api.watchlist.listWatchedItems)).resolves.toMatchObject([
      {
        itemType: "tradePlan",
        tradePlanId: closedTradePlanId,
      },
      {
        campaignId: closedCampaignId,
        itemType: "campaign",
      },
    ]);
  });

  it("deduplicates repeated watches and scopes list results by owner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"));

    try {
      const campaignId = await insertCampaign(ownerA, "active");
      const tradePlanId = await insertTradePlan({
        ownerId: ownerA,
        status: "watching",
      });
      const otherCampaignId = await insertCampaign(ownerB, "planning");

      const userA = asUser(ownerA);
      const userB = asUser(ownerB);

      const firstWatchId = await userA.mutation(api.watchlist.watchItem, {
        item: {
          campaignId,
          itemType: "campaign",
        },
      });
      const secondWatchId = await userA.mutation(api.watchlist.watchItem, {
        item: {
          campaignId,
          itemType: "campaign",
        },
      });

      vi.setSystemTime(new Date("2026-03-08T12:05:00.000Z"));

      await userA.mutation(api.watchlist.watchItem, {
        item: {
          itemType: "tradePlan",
          tradePlanId,
        },
      });
      await userB.mutation(api.watchlist.watchItem, {
        item: {
          campaignId: otherCampaignId,
          itemType: "campaign",
        },
      });

      expect(secondWatchId).toBe(firstWatchId);
      await expect(userA.query(api.watchlist.listWatchedItems)).resolves.toMatchObject([
        {
          itemType: "tradePlan",
          tradePlanId,
        },
        {
          _id: firstWatchId,
          campaignId,
          itemType: "campaign",
        },
      ]);
      await expect(userB.query(api.watchlist.listWatchedItems)).resolves.toMatchObject([
        {
          campaignId: otherCampaignId,
          itemType: "campaign",
          ownerId: ownerB,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects invalid or foreign watch targets", async () => {
    const foreignCampaignId = await insertCampaign(ownerB, "planning");
    const deletedTradePlanId = await insertTradePlan({
      ownerId: ownerA,
      status: "idea",
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(deletedTradePlanId);
    });

    const user = asUser(ownerA);

    await expect(
      user.mutation(api.watchlist.watchItem, {
        item: {
          campaignId: foreignCampaignId,
          itemType: "campaign",
        },
      }),
    ).rejects.toThrow("Campaign not found");

    await expect(
      user.mutation(api.watchlist.unwatchItem, {
        item: {
          itemType: "tradePlan",
          tradePlanId: deletedTradePlanId,
        },
      }),
    ).resolves.toBeNull();
  });
});
