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

describe("bravos review queue", () => {
  const ownerId = "owner-a";
  const workerSecret = "test-worker-secret";
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    process.env.BRAVOS_WORKER_SECRET = workerSecret;
    process.env.BRAVOS_WORKER_URL = "https://worker.test/api/internal/bravos/run";
    process.env.BRAVOS_DISABLE_DISPATCH_FOR_TESTS = "1";
    t = convexTest(schema, modules);
  });

  function asUser() {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertRun(args: {
    kind?: "direct_post_fetch" | "listing_scan" | "scheduled_scan";
    sourceUrl: string;
  }): Promise<Id<"bravosSyncRuns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("bravosSyncRuns", {
        kind: args.kind ?? "direct_post_fetch",
        ownerId,
        requestedAt: Date.now(),
        requestedSourceUrl: args.sourceUrl,
        status: "queued",
      });
    });
  }

  async function insertTradePlan(): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        instrumentSymbol: "QQQ",
        name: "QQQ Bravos",
        ownerId,
        rationale: "Existing rationale",
        status: "watching",
      });
    });
  }

  it("creates one review item per canonical Bravos source identity", async () => {
    const syncRunId = await insertRun({
      sourceUrl: "https://example.com/post/1?utm_source=x",
    });

    const firstId = await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "direct_post_fetch",
      imageUrls: [],
      proposedAction: {
        instrumentSymbol: "QQQ",
        kind: "create_trade_plan",
        name: "QQQ setup",
      },
      rawText: "QQQ setup",
      sourceUrl: "https://example.com/post/1?utm_source=x",
      syncRunId,
      workerSecret,
    });
    const secondId = await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "direct_post_fetch",
      imageUrls: ["https://example.com/chart.png"],
      proposedAction: {
        instrumentSymbol: "QQQ",
        kind: "create_trade_plan",
        name: "QQQ setup refreshed",
      },
      rawText: "QQQ setup refreshed",
      sourceTitle: "QQQ Breakout Setup",
      sourceUrl: "https://example.com/post/1",
      syncRunId,
      workerSecret,
    });

    expect(secondId).toBe(firstId);
    const items = await asUser().query(api.bravos.listBravosReviewItems, {
      paginationOpts: {
        cursor: null,
        numItems: 25,
      },
    });
    expect(items.page).toHaveLength(1);
    expect(items.page[0]).toMatchObject({
      imageUrls: ["https://example.com/chart.png"],
      rawText: "QQQ setup refreshed",
      sourceTitle: "QQQ Breakout Setup",
    });
  });

  it("does not mutate trade plans until approval", async () => {
    const syncRunId = await insertRun({ sourceUrl: "https://example.com/post/2" });
    await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "direct_post_fetch",
      imageUrls: [],
      proposedAction: {
        instrumentSymbol: "AAPL",
        kind: "create_trade_plan",
        name: "AAPL setup",
      },
      rawText: "AAPL setup",
      sourceUrl: "https://example.com/post/2",
      syncRunId,
      workerSecret,
    });

    const plans = await t.run(async (ctx) => {
      return await ctx.db
        .query("tradePlans")
        .take(10);
    });
    expect(plans).toEqual([]);
  });

  it("paginates Bravos review items", async () => {
    const syncRunId = await insertRun({ sourceUrl: "https://example.com/post/2" });
    for (const index of [1, 2, 3]) {
      await t.mutation(api.bravos.upsertReviewItemForWorker, {
        classification: "initiate",
        fetchSource: "direct_post_fetch",
        imageUrls: [],
        proposedAction: {
          instrumentSymbol: "QQQ",
          kind: "create_trade_plan",
          name: `QQQ setup ${index}`,
        },
        rawText: `QQQ setup ${index}`,
        sourceUrl: `https://example.com/post/${index}`,
        syncRunId,
        workerSecret,
      });
    }

    const firstPage = await asUser().query(api.bravos.listBravosReviewItems, {
      paginationOpts: {
        cursor: null,
        numItems: 2,
      },
    });
    expect(firstPage.page).toHaveLength(2);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await asUser().query(api.bravos.listBravosReviewItems, {
      paginationOpts: {
        cursor: firstPage.continueCursor,
        numItems: 2,
      },
    });
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.isDone).toBe(true);
  });

  it("queues a listing scan with the saved listing URL", async () => {
    await asUser().mutation(api.bravos.saveBravosListingUrl, {
      listingUrl:
        "https://bravosresearch.com/category/portfolio-update/?utm_source=test",
    });

    const syncRunId = await asUser().mutation(api.bravos.requestBravosListingScan, {});

    const run = await t.run(async (ctx) => await ctx.db.get(syncRunId));
    expect(run).toMatchObject({
      kind: "listing_scan",
      ownerId,
      requestedSourceUrl:
        "https://bravosresearch.com/category/portfolio-update",
      status: "queued",
    });
  });

  it("filters already-known listing posts for the worker", async () => {
    const syncRunId = await insertRun({
      kind: "listing_scan",
      sourceUrl: "https://example.com/category/trade-alerts",
    });
    await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "initiate",
      fetchSource: "listing_scan",
      imageUrls: [],
      proposedAction: {
        instrumentSymbol: "QQQ",
        kind: "create_trade_plan",
        name: "QQQ setup",
      },
      rawText: "QQQ setup",
      sourceUrl: "https://example.com/post/1",
      syncRunId,
      workerSecret,
    });

    const unseen = await t.mutation(api.bravos.filterUnseenListingPostsForWorker, {
      posts: [
        {
          sourceUrl: "https://example.com/post/1",
        },
        {
          sourceUrl: "https://example.com/post/2?utm_source=test",
        },
      ],
      syncRunId,
      workerSecret,
    });

    expect(unseen).toEqual([
      {
        sourceUrl: "https://example.com/post/2",
      },
    ]);
  });

  it("uses the source post date for follow-up field update prefixes", async () => {
    const tradePlanId = await insertTradePlan();
    const syncRunId = await insertRun({ sourceUrl: "https://example.com/post/3" });
    const reviewItemId = await t.mutation(api.bravos.upsertReviewItemForWorker, {
      classification: "follow_up",
      fetchSource: "direct_post_fetch",
      imageUrls: [],
      proposedAction: {
        fieldUpdates: [{ field: "rationale", text: "Raise stop after breakout." }],
        kind: "apply_follow_up",
        targetTradePlanId: tradePlanId,
      },
      rawText: "QQQ update",
      sourcePostDate: "2026-04-10",
      sourceUrl: "https://example.com/post/3",
      syncRunId,
      workerSecret,
    });

    await asUser().mutation(api.bravos.approveBravosReviewItem, {
      reviewItemId,
    });

    const plan = await t.run(async (ctx) => await ctx.db.get(tradePlanId));
    expect(plan?.rationale).toContain("[2026-04-10] Raise stop after breakout.");
  });

  it("marks the connection as needs_reconnect when auth fails", async () => {
    await asUser().mutation(api.bravos.saveBravosBrowserbaseSession, {
      browserbaseContextId: "ctx_123",
    });
    const syncRunId = await insertRun({ sourceUrl: "https://example.com/post/4" });

    await t.mutation(api.bravos.markRunErrorForWorker, {
      error: "Unauthorized on Bravos",
      markConnectionNeedsReconnect: true,
      syncRunId,
      workerSecret,
    });

    const connection = await asUser().query(api.bravos.getBravosConnection, {});
    expect(connection).toMatchObject({
      reconnectReason: "Unauthorized on Bravos",
      status: "needs_reconnect",
    });
  });
});
