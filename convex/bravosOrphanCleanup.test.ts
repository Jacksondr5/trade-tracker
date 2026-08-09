// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ownerId = "owner-a";
const sourceUrl =
  "https://bravosresearch.com/news-feed/initiating-long-on-deere-company-de-potential-breakout/";

describe("known Bravos orphan repair", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function insertOrphan(args?: { keepTradePlan?: boolean }) {
    return await t.run(async (ctx) => {
      const tradePlanId = await ctx.db.insert("tradePlans", {
        instrumentSymbol: "DE",
        name: "Long DE",
        ownerId,
        rationale: "Imported Bravos plan",
        sourceUrl,
        status: "active",
      });
      const noteId = await ctx.db.insert("notes", {
        content: `Imported from service post: ${sourceUrl}`,
        noteDate: Date.now(),
        ownerId,
        tradePlanId,
      });
      const importTaskId = await ctx.db.insert("importTasks", {
        createdTradePlanId: tradePlanId,
        mode: "create",
        ownerId,
        pastedText: "Imported Deere recommendation",
        sourceUrl,
        status: "done",
      });
      if (!args?.keepTradePlan) await ctx.db.delete(tradePlanId);
      return { importTaskId, noteId, tradePlanId };
    });
  }

  it("reports two effects in dry-run mode without changing either record", async () => {
    const orphan = await insertOrphan();

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: true,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).resolves.toEqual({
      clearedCreatedImportTaskPlanIds: 1,
      deletedNotes: 1,
      patchedImportTasks: 1,
    });

    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).toMatchObject({
      tradePlanId: orphan.tradePlanId,
    });
    expect(await t.run((ctx) => ctx.db.get(orphan.importTaskId))).toMatchObject(
      { createdTradePlanId: orphan.tradePlanId },
    );
  });

  it("deletes only the approved note and clears only the stale task reference", async () => {
    const orphan = await insertOrphan();

    const result = await t.mutation(
      internal.bravosOrphanCleanup.repairKnownBravosOrphan,
      {
        dryRun: false,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      },
    );

    expect(result).toEqual({
      clearedCreatedImportTaskPlanIds: 1,
      deletedNotes: 1,
      patchedImportTasks: 1,
    });
    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(orphan.importTaskId))).toMatchObject(
      {
        mode: "create",
        sourceUrl,
        status: "done",
      },
    );
    expect(
      await t.run((ctx) => ctx.db.get(orphan.importTaskId)),
    ).not.toHaveProperty("createdTradePlanId");
  });

  it("fails closed when the referenced plan still exists", async () => {
    const orphan = await insertOrphan({ keepTradePlan: true });

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: false,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).rejects.toThrow("referenced trade plan still exists");
    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(orphan.importTaskId))).toMatchObject(
      { createdTradePlanId: orphan.tradePlanId },
    );
  });

  it("fails closed when the task no longer has the exact Bravos provenance", async () => {
    const orphan = await insertOrphan();
    await t.run(async (ctx) => {
      await ctx.db.patch(orphan.importTaskId, {
        sourceUrl: "https://example.com/changed-source",
      });
    });

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: false,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).rejects.toThrow("records no longer match the approved provenance");
    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(orphan.importTaskId))).toMatchObject(
      { createdTradePlanId: orphan.tradePlanId },
    );
  });

  it("fails closed when a review action targets the missing trade plan", async () => {
    const orphan = await insertOrphan();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("bravosReviewItems", {
        canonicalSourceIdentity: sourceUrl,
        classification: "follow_up",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          fieldUpdates: [],
          kind: "apply_follow_up",
          targetTradePlanId: orphan.tradePlanId,
        },
        rawText: "Deere follow-up",
        reviewState: "approved",
        sourceUrl,
      });
    });

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: false,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).rejects.toThrow("review item still references the orphan");
    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).not.toBeNull();
  });

  it("fails closed when a review item still references the orphan note", async () => {
    const orphan = await insertOrphan();
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("bravosReviewItems", {
        appliedNoteId: orphan.noteId,
        canonicalSourceIdentity: sourceUrl,
        classification: "initiate",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          instrumentSymbol: "DE",
          kind: "create_trade_plan",
          name: "Long DE",
        },
        rawText: "Deere setup",
        reviewState: "approved",
        sourceUrl,
      });
    });

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: false,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).rejects.toThrow("review item still references the orphan");
    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(orphan.importTaskId))).toMatchObject(
      { createdTradePlanId: orphan.tradePlanId },
    );
  });

  it.each(["watchlist", "retrospective"] as const)(
    "fails closed when a %s still targets the missing trade plan",
    async (referenceKind) => {
      const orphan = await insertOrphan();
      await t.run(async (ctx) => {
        if (referenceKind === "watchlist") {
          await ctx.db.insert("watchlist", {
            itemType: "tradePlan",
            ownerId,
            tradePlanId: orphan.tradePlanId,
            watchedAt: Date.now(),
          });
          return;
        }
        await ctx.db.insert("retrospectives", {
          content: "Keep this retrospective",
          ownerId,
          parentId: orphan.tradePlanId,
          parentKind: "tradePlan",
          updatedAt: Date.now(),
        });
      });

      await expect(
        t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
          dryRun: false,
          importTaskId: orphan.importTaskId,
          missingTradePlanId: orphan.tradePlanId,
          noteId: orphan.noteId,
        }),
      ).rejects.toThrow("user-content reference still targets the orphan");
      expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).not.toBeNull();
    },
  );

  it("allows exactly 500 reviews but refuses a larger review history", async () => {
    const orphan = await insertOrphan();
    await t.run(async (ctx) => {
      const now = Date.now();
      for (const index of Array.from({ length: 500 }, (_, value) => value)) {
        await ctx.db.insert("bravosReviewItems", {
          canonicalSourceIdentity: `${sourceUrl}?review=${index}`,
          classification: "initiate",
          fetchSource: "direct_post_fetch",
          fetchedAt: now,
          imageUrls: [],
          lastFetchedAt: now,
          ownerId,
          proposedAction: {
            instrumentSymbol: "DE",
            kind: "create_trade_plan",
            name: "Long DE",
          },
          rawText: "Deere setup",
          reviewState: "approved",
          sourceUrl: `${sourceUrl}?review=${index}`,
        });
      }
    });

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: true,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).resolves.toMatchObject({ deletedNotes: 1 });

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("bravosReviewItems", {
        canonicalSourceIdentity: `${sourceUrl}?review=500`,
        classification: "initiate",
        fetchSource: "direct_post_fetch",
        fetchedAt: now,
        imageUrls: [],
        lastFetchedAt: now,
        ownerId,
        proposedAction: {
          instrumentSymbol: "DE",
          kind: "create_trade_plan",
          name: "Long DE",
        },
        rawText: "Deere setup",
        reviewState: "approved",
        sourceUrl: `${sourceUrl}?review=500`,
      });
    });

    await expect(
      t.mutation(internal.bravosOrphanCleanup.repairKnownBravosOrphan, {
        dryRun: true,
        importTaskId: orphan.importTaskId,
        missingTradePlanId: orphan.tradePlanId,
        noteId: orphan.noteId,
      }),
    ).rejects.toThrow("review history exceeds its bounded safety limit");
    expect(await t.run((ctx) => ctx.db.get(orphan.noteId))).not.toBeNull();
  });
});
