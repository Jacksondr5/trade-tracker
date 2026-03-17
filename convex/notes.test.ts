// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
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

describe("notes cleanup migration helpers", () => {
  const ownerId = "owner-a";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function insertCampaign(name: string): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        name,
        ownerId,
        status: "active",
        thesis: `${name} thesis`,
      });
    });
  }

  async function insertTradePlan(args: {
    campaignId?: Id<"campaigns">;
    name: string;
  }): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        campaignId: args.campaignId,
        instrumentSymbol: "NVDA",
        name: args.name,
        ownerId,
        status: "watching",
      });
    });
  }

  async function insertTrade(args: {
    ticker: string;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.now(),
        direction: "long",
        ownerId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: "manual",
        ticker: args.ticker,
        tradePlanId: args.tradePlanId,
      });
    });
  }

  async function insertNote(args: {
    campaignId?: Id<"campaigns">;
    content: string;
    tradeId?: Id<"trades">;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"notes">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        campaignId: args.campaignId,
        content: args.content,
        ownerId,
        tradeId: args.tradeId,
        tradePlanId: args.tradePlanId,
      });
    });
  }

  it("summarizes only trade-attached notes", async () => {
    const campaignId = await insertCampaign("Campaign");
    const tradePlanId = await insertTradePlan({ campaignId, name: "Plan" });
    const tradeId = await insertTrade({ ticker: "NVDA", tradePlanId });

    await insertNote({ content: "general note" });
    await insertNote({ campaignId, content: "campaign note" });
    const tradeNoteId = await insertNote({
      content: "legacy trade note",
      tradeId,
    });

    const summary = await t.query(
      internal.notesCleanup.getTradeAttachedNotesSummary,
      {},
    );

    expect(summary.totalCount).toBe(1);
    expect(summary.sample).toHaveLength(1);
    expect(summary.sample[0]).toMatchObject({
      noteId: tradeNoteId,
      ownerId,
      tradeId,
    });
  });

  it("deletes legacy trade-attached notes in batches without touching supported notes", async () => {
    const campaignId = await insertCampaign("Campaign");
    const tradePlanId = await insertTradePlan({ campaignId, name: "Plan" });
    const firstTradeId = await insertTrade({ ticker: "NVDA", tradePlanId });
    const secondTradeId = await insertTrade({ ticker: "AAPL", tradePlanId });

    const firstTradeNoteId = await insertNote({
      content: "first legacy trade note",
      tradeId: firstTradeId,
    });
    const secondTradeNoteId = await insertNote({
      content: "second legacy trade note",
      tradeId: secondTradeId,
    });
    const campaignNoteId = await insertNote({
      campaignId,
      content: "campaign note",
    });
    const tradePlanNoteId = await insertNote({
      content: "trade plan note",
      tradePlanId,
    });
    const generalNoteId = await insertNote({ content: "general note" });

    const firstBatch = await t.mutation(
      internal.notesCleanup.deleteTradeAttachedNotesBatch,
      {
        batchSize: 1,
      },
    );

    expect(firstBatch).toEqual({
      deletedCount: 1,
      deletedNoteIds: [firstTradeNoteId],
      hasMore: true,
      remainingCount: 1,
    });

    const secondBatch = await t.mutation(
      internal.notesCleanup.deleteTradeAttachedNotesBatch,
      {
        batchSize: 10,
      },
    );

    expect(secondBatch).toEqual({
      deletedCount: 1,
      deletedNoteIds: [secondTradeNoteId],
      hasMore: false,
      remainingCount: 0,
    });

    const remainingNotes = await t.run(async (ctx) => {
      return await ctx.db.query("notes").collect();
    });

    expect(remainingNotes.map((note) => note._id).sort()).toEqual(
      [campaignNoteId, generalNoteId, tradePlanNoteId].sort(),
    );
  });

  it("rejects invalid batch and sample sizes", async () => {
    await expect(
      t.query(internal.notesCleanup.getTradeAttachedNotesSummary, {
        sampleSize: 0,
      }),
    ).rejects.toThrow("sampleSize must be a positive integer");

    await expect(
      t.mutation(internal.notesCleanup.deleteTradeAttachedNotesBatch, {
        batchSize: 0,
      }),
    ).rejects.toThrow("batchSize must be a positive integer");
  });
});
