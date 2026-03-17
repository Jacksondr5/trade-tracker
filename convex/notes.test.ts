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

describe("notes contract", () => {
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
  }): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        name: args.name,
        ownerId: args.ownerId,
        status: "active",
        thesis: `${args.name} thesis`,
      });
    });
  }

  async function insertTradePlan(args: {
    campaignId?: Id<"campaigns">;
    name: string;
    ownerId: string;
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        campaignId: args.campaignId,
        instrumentSymbol: "NVDA",
        name: args.name,
        ownerId: args.ownerId,
        status: "watching",
      });
    });
  }

  async function insertNote(args: {
    campaignId?: Id<"campaigns">;
    chartUrls?: string[];
    content: string;
    evidence?: Array<{
      contentType?: string;
      fileName?: string;
      kind: "chart" | "image";
      storageId?: Id<"_storage">;
      url?: string;
    }>;
    ownerId: string;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"notes">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        campaignId: args.campaignId,
        chartUrls: args.chartUrls,
        content: args.content,
        evidence: args.evidence,
        ownerId: args.ownerId,
        tradePlanId: args.tradePlanId,
      });
    });
  }

  it("rejects notes with multiple parents", async () => {
    const campaignId = await insertCampaign({
      name: "Campaign",
      ownerId: ownerA,
    });
    const tradePlanId = await insertTradePlan({
      campaignId,
      name: "Trade plan",
      ownerId: ownerA,
    });

    await expect(
      asUser(ownerA).mutation(api.notes.addNote, {
        campaignId,
        content: "invalid note",
        tradePlanId,
      }),
    ).rejects.toThrow("A note can only belong to one parent");
  });

  it("rejects evidence items without a url or storage id", async () => {
    await expect(
      asUser(ownerA).mutation(api.notes.addNote, {
        content: "invalid evidence note",
        evidence: [{ kind: "chart" }],
      }),
    ).rejects.toThrow(
      "Each evidence item must include either a storageId or a url",
    );
  });

  it("returns a unified notes feed with context metadata and normalized evidence", async () => {
    const campaignId = await insertCampaign({
      name: "Macro Thesis",
      ownerId: ownerA,
    });
    const tradePlanId = await insertTradePlan({
      campaignId,
      name: "NVDA Breakout",
      ownerId: ownerA,
    });
    const otherUserCampaignId = await insertCampaign({
      name: "Other User Campaign",
      ownerId: ownerB,
    });

    await insertNote({
      content: "general note",
      ownerId: ownerA,
    });
    await insertNote({
      campaignId,
      chartUrls: ["https://example.com/legacy-chart.png"],
      content: "campaign note",
      ownerId: ownerA,
    });
    await insertNote({
      content: "trade plan note",
      evidence: [
        {
          fileName: "setup.png",
          kind: "image",
          url: "https://example.com/setup.png",
        },
      ],
      ownerId: ownerA,
      tradePlanId,
    });
    await insertNote({
      campaignId: otherUserCampaignId,
      content: "other user note",
      ownerId: ownerB,
    });

    const notes = await asUser(ownerA).query(api.notes.getNotesFeed, {});

    expect(notes).toHaveLength(3);
    expect(notes.map((note) => note.contextKind)).toEqual([
      "tradePlan",
      "campaign",
      "general",
    ]);
    expect(notes.map((note) => note.contextLabel)).toEqual([
      "NVDA Breakout",
      "Macro Thesis",
      "General note",
    ]);
    expect(notes.map((note) => note.contextHref)).toEqual([
      `/trade-plans/${tradePlanId}`,
      `/campaigns/${campaignId}`,
      null,
    ]);
    expect(notes[0]?.evidence).toEqual([
      {
        contentType: undefined,
        fileName: "setup.png",
        kind: "image",
        storageId: undefined,
        url: "https://example.com/setup.png",
      },
    ]);
    expect(notes[0]?.chartUrls).toEqual(["https://example.com/setup.png"]);
    expect(notes[1]?.evidence).toEqual([
      {
        contentType: undefined,
        fileName: undefined,
        kind: "chart",
        storageId: undefined,
        url: "https://example.com/legacy-chart.png",
      },
    ]);
    expect(notes[1]?.chartUrls).toEqual([
      "https://example.com/legacy-chart.png",
    ]);
  });

  it("filters campaign, trade-plan, and general queries to the supported ownership model", async () => {
    const campaignId = await insertCampaign({
      name: "Campaign",
      ownerId: ownerA,
    });
    const tradePlanId = await insertTradePlan({
      campaignId,
      name: "Trade plan",
      ownerId: ownerA,
    });

    const generalNoteId = await insertNote({
      content: "general note",
      ownerId: ownerA,
    });
    const campaignNoteId = await insertNote({
      campaignId,
      content: "campaign note",
      ownerId: ownerA,
    });
    const tradePlanNoteId = await insertNote({
      content: "trade plan note",
      ownerId: ownerA,
      tradePlanId,
    });

    const campaignNotes = await asUser(ownerA).query(
      api.notes.getNotesByCampaign,
      {
        campaignId,
      },
    );
    const tradePlanNotes = await asUser(ownerA).query(
      api.notes.getNotesByTradePlan,
      {
        tradePlanId,
      },
    );
    const generalNotes = await asUser(ownerA).query(
      api.notes.getGeneralNotes,
      {},
    );

    expect(campaignNotes.map((note) => note._id)).toEqual([campaignNoteId]);
    expect(tradePlanNotes.map((note) => note._id)).toEqual([tradePlanNoteId]);
    expect(generalNotes.map((note) => note._id)).toEqual([generalNoteId]);
  });
});
