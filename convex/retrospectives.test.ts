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

describe("retrospectives", () => {
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
    status: "active" | "closed" | "planning";
  }): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        closedAt: args.closedAt,
        name: args.name,
        ownerId: args.ownerId,
        status: args.status,
        thesis: `${args.name} thesis`,
      });
    });
  }

  async function insertTradePlan(args: {
    closedAt?: number;
    instrumentSymbol: string;
    name: string;
    ownerId: string;
    status: "active" | "closed" | "idea" | "watching";
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        closedAt: args.closedAt,
        instrumentSymbol: args.instrumentSymbol,
        name: args.name,
        ownerId: args.ownerId,
        status: args.status,
      });
    });
  }

  describe("upsertRetrospective", () => {
    it("creates a retrospective for a closed campaign", async () => {
      const campaignId = await insertCampaign({
        closedAt: Date.now(),
        name: "Closed Campaign",
        ownerId: ownerA,
        status: "closed",
      });

      const user = asUser(ownerA);
      await user.mutation(api.retrospectives.upsertRetrospective, {
        content: "What I learned",
        parentId: campaignId,
        parentKind: "campaign",
      });

      const retro = await user.query(api.retrospectives.getRetrospective, {
        parentId: campaignId,
      });
      expect(retro).not.toBeNull();
      expect(retro!.content).toBe("What I learned");
      expect(retro!.parentKind).toBe("campaign");
    });

    it("creates a retrospective for a closed trade plan", async () => {
      const tradePlanId = await insertTradePlan({
        closedAt: Date.now(),
        instrumentSymbol: "AAPL",
        name: "Closed Plan",
        ownerId: ownerA,
        status: "closed",
      });

      const user = asUser(ownerA);
      await user.mutation(api.retrospectives.upsertRetrospective, {
        content: "Trade plan lessons",
        parentId: tradePlanId,
        parentKind: "tradePlan",
      });

      const retro = await user.query(api.retrospectives.getRetrospective, {
        parentId: tradePlanId,
      });
      expect(retro).not.toBeNull();
      expect(retro!.content).toBe("Trade plan lessons");
      expect(retro!.parentKind).toBe("tradePlan");
    });

    it("updates an existing retrospective", async () => {
      const campaignId = await insertCampaign({
        closedAt: Date.now(),
        name: "Closed Campaign",
        ownerId: ownerA,
        status: "closed",
      });

      const user = asUser(ownerA);
      await user.mutation(api.retrospectives.upsertRetrospective, {
        content: "First draft",
        parentId: campaignId,
        parentKind: "campaign",
      });

      await user.mutation(api.retrospectives.upsertRetrospective, {
        content: "Revised review",
        parentId: campaignId,
        parentKind: "campaign",
      });

      const retro = await user.query(api.retrospectives.getRetrospective, {
        parentId: campaignId,
      });
      expect(retro!.content).toBe("Revised review");

      // Verify only one retrospective exists for this parent
      const allRetros = await t.run(async (ctx) => {
        return await ctx.db
          .query("retrospectives")
          .collect();
      });
      const matching = allRetros.filter(
        (r) => r.ownerId === ownerA && r.parentId === campaignId,
      );
      expect(matching).toHaveLength(1);
    });

    it("rejects retrospective for non-closed campaign", async () => {
      const campaignId = await insertCampaign({
        name: "Active Campaign",
        ownerId: ownerA,
        status: "active",
      });

      const user = asUser(ownerA);
      await expect(
        user.mutation(api.retrospectives.upsertRetrospective, {
          content: "Too early",
          parentId: campaignId,
          parentKind: "campaign",
        }),
      ).rejects.toThrow("Retrospective can only be written for closed campaigns");
    });

    it("rejects retrospective for non-closed trade plan", async () => {
      const tradePlanId = await insertTradePlan({
        instrumentSymbol: "TSLA",
        name: "Active Plan",
        ownerId: ownerA,
        status: "watching",
      });

      const user = asUser(ownerA);
      await expect(
        user.mutation(api.retrospectives.upsertRetrospective, {
          content: "Not yet",
          parentId: tradePlanId,
          parentKind: "tradePlan",
        }),
      ).rejects.toThrow("Retrospective can only be written for closed trade plans");
    });

    it("rejects retrospective for another user's campaign", async () => {
      const campaignId = await insertCampaign({
        closedAt: Date.now(),
        name: "Owner A Campaign",
        ownerId: ownerA,
        status: "closed",
      });

      const userB = asUser(ownerB);
      await expect(
        userB.mutation(api.retrospectives.upsertRetrospective, {
          content: "Not my campaign",
          parentId: campaignId,
          parentKind: "campaign",
        }),
      ).rejects.toThrow("Campaign not found");
    });

    it("rejects retrospective for another user's trade plan", async () => {
      const tradePlanId = await insertTradePlan({
        closedAt: Date.now(),
        instrumentSymbol: "MSFT",
        name: "Owner A Plan",
        ownerId: ownerA,
        status: "closed",
      });

      const userB = asUser(ownerB);
      await expect(
        userB.mutation(api.retrospectives.upsertRetrospective, {
          content: "Not my plan",
          parentId: tradePlanId,
          parentKind: "tradePlan",
        }),
      ).rejects.toThrow("Trade plan not found");
    });
  });

  describe("getRetrospective", () => {
    it("returns null when no retrospective exists", async () => {
      const campaignId = await insertCampaign({
        closedAt: Date.now(),
        name: "No Review Yet",
        ownerId: ownerA,
        status: "closed",
      });

      const user = asUser(ownerA);
      const retro = await user.query(api.retrospectives.getRetrospective, {
        parentId: campaignId,
      });
      expect(retro).toBeNull();
    });

    it("returns null for another user's retrospective", async () => {
      const campaignId = await insertCampaign({
        closedAt: Date.now(),
        name: "Private Campaign",
        ownerId: ownerA,
        status: "closed",
      });

      await asUser(ownerA).mutation(api.retrospectives.upsertRetrospective, {
        content: "My review",
        parentId: campaignId,
        parentKind: "campaign",
      });

      const userB = asUser(ownerB);
      const retro = await userB.query(api.retrospectives.getRetrospective, {
        parentId: campaignId,
      });
      expect(retro).toBeNull();
    });
  });
});
