// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    noteDate?: number;
    ownerId: string;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"notes">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        campaignId: args.campaignId,
        chartUrls: args.chartUrls,
        content: args.content,
        evidence: args.evidence,
        noteDate: args.noteDate,
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

  it("uses explicit note dates for feed ordering", async () => {
    const olderNoteDate = Date.UTC(2026, 4, 7, 14, 0);
    const newerNoteDate = Date.UTC(2026, 4, 8, 14, 0);

    const firstCreatedId = await insertNote({
      content: "created first, dated newer",
      noteDate: newerNoteDate,
      ownerId: ownerA,
    });
    const secondCreatedId = await insertNote({
      content: "created second, dated older",
      noteDate: olderNoteDate,
      ownerId: ownerA,
    });

    const notes = await asUser(ownerA).query(api.notes.getNotesFeed, {});

    expect(notes.map((note) => note._id)).toEqual([firstCreatedId, secondCreatedId]);
    expect(notes.find((note) => note._id === firstCreatedId)?.noteDate).toBe(
      newerNoteDate,
    );
    expect(notes.find((note) => note._id === secondCreatedId)?.noteDate).toBe(
      olderNoteDate,
    );
  });

  it("falls back to creation time for legacy notes without explicit note dates", async () => {
    const noteId = await insertNote({
      content: "legacy note without explicit note date",
      ownerId: ownerA,
    });

    const notes = await asUser(ownerA).query(api.notes.getNotesFeed, {});
    const legacyNote = notes.find((note) => note._id === noteId);

    expect(legacyNote?.noteDate).toBe(legacyNote?._creationTime);
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

  it("orders campaign and trade-plan timelines by explicit note date ascending", async () => {
    const campaignId = await insertCampaign({
      name: "Campaign",
      ownerId: ownerA,
    });
    const tradePlanId = await insertTradePlan({
      campaignId,
      name: "Trade plan",
      ownerId: ownerA,
    });

    const laterDate = Date.UTC(2026, 4, 8, 14, 0);
    const earlierDate = Date.UTC(2026, 4, 7, 14, 0);

    const campaignLaterId = await insertNote({
      campaignId,
      content: "campaign later",
      noteDate: laterDate,
      ownerId: ownerA,
    });
    const campaignEarlierId = await insertNote({
      campaignId,
      content: "campaign earlier",
      noteDate: earlierDate,
      ownerId: ownerA,
    });
    const tradePlanLaterId = await insertNote({
      content: "trade plan later",
      noteDate: laterDate,
      ownerId: ownerA,
      tradePlanId,
    });
    const tradePlanEarlierId = await insertNote({
      content: "trade plan earlier",
      noteDate: earlierDate,
      ownerId: ownerA,
      tradePlanId,
    });

    const campaignNotes = await asUser(ownerA).query(
      api.notes.getNotesByCampaign,
      { campaignId },
    );
    const tradePlanNotes = await asUser(ownerA).query(
      api.notes.getNotesByTradePlan,
      { tradePlanId },
    );

    expect(campaignNotes.map((note) => note._id)).toEqual([
      campaignEarlierId,
      campaignLaterId,
    ]);
    expect(tradePlanNotes.map((note) => note._id)).toEqual([
      tradePlanEarlierId,
      tradePlanLaterId,
    ]);
  });

  describe("updateNote", () => {
    it("updates content for the owner's note", async () => {
      const noteId = await insertNote({
        content: "original content",
        ownerId: ownerA,
      });

      await asUser(ownerA).mutation(api.notes.updateNote, {
        content: "updated content",
        noteId,
      });

      const notes = await asUser(ownerA).query(api.notes.getNotesFeed, {});
      expect(notes).toHaveLength(1);
      expect(notes[0]?.content).toBe("updated content");
    });

    it("updates note date for the owner's note", async () => {
      const originalDate = Date.UTC(2026, 4, 8, 14, 0);
      const updatedDate = Date.UTC(2026, 4, 7, 14, 0);
      const noteId = await insertNote({
        content: "date-bearing note",
        noteDate: originalDate,
        ownerId: ownerA,
      });

      await asUser(ownerA).mutation(api.notes.updateNote, {
        noteDate: updatedDate,
        noteId,
      });

      const notes = await asUser(ownerA).query(api.notes.getNotesFeed, {});
      expect(notes).toHaveLength(1);
      expect(notes[0]?.noteDate).toBe(updatedDate);
    });

    it("rejects updates from a non-owner", async () => {
      const noteId = await insertNote({
        content: "owner A note",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerB).mutation(api.notes.updateNote, {
          content: "hijacked",
          noteId,
        }),
      ).rejects.toThrow("Note not found");
    });

    it("rejects empty content", async () => {
      const noteId = await insertNote({
        content: "valid note",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerA).mutation(api.notes.updateNote, {
          content: "   ",
          noteId,
        }),
      ).rejects.toThrow("Note content is required");
    });

    it("updates evidence on an existing note", async () => {
      const noteId = await insertNote({
        content: "note with evidence",
        ownerId: ownerA,
      });

      await asUser(ownerA).mutation(api.notes.updateNote, {
        evidence: [
          {
            kind: "chart",
            url: "https://example.com/chart.png",
          },
        ],
        noteId,
      });

      const notes = await asUser(ownerA).query(api.notes.getNotesFeed, {});
      expect(notes[0]?.evidence).toEqual([
        {
          contentType: undefined,
          fileName: undefined,
          kind: "chart",
          storageId: undefined,
          url: "https://example.com/chart.png",
        },
      ]);
    });
  });
});

describe("note date migration", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";
  const migrationSecret = "test-migration-secret";
  const originalMigrationSecret = process.env.CONVEX_MIGRATION_SECRET;

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    process.env.CONVEX_MIGRATION_SECRET = migrationSecret;
    t = convexTest(schema, modules);
  });
  afterEach(() => {
    if (originalMigrationSecret === undefined) {
      delete process.env.CONVEX_MIGRATION_SECRET;
      return;
    }

    process.env.CONVEX_MIGRATION_SECRET = originalMigrationSecret;
  });

  async function insertNote(args: {
    content: string;
    noteDate?: number;
    ownerId: string;
  }): Promise<Id<"notes">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("notes", {
        content: args.content,
        noteDate: args.noteDate,
        ownerId: args.ownerId,
      });
    });
  }

  it("backfills missing note dates from creation time without overwriting existing note dates", async () => {
    const existingNoteDate = Date.UTC(2026, 4, 7, 14, 0);
    const legacyNoteId = await insertNote({
      content: "legacy note",
      ownerId: ownerA,
    });
    const datedNoteId = await insertNote({
      content: "dated note",
      noteDate: existingNoteDate,
      ownerId: ownerB,
    });

    const dryRunResult = await t.mutation(
      api.migrations.backfillNoteDates.run,
      {
        cursor: null,
        dryRun: true,
        numItems: 100,
        secret: migrationSecret,
      },
    );
    expect(dryRunResult).toMatchObject({
      isDone: true,
      patched: 1,
      scanned: 2,
    });

    const migrationResult = await t.mutation(
      api.migrations.backfillNoteDates.run,
      {
        cursor: null,
        numItems: 100,
        secret: migrationSecret,
      },
    );
    expect(migrationResult).toMatchObject({
      isDone: true,
      patched: 1,
      scanned: 2,
    });

    const { datedNote, legacyNote } = await t.run(async (ctx) => {
      return {
        datedNote: await ctx.db.get(datedNoteId),
        legacyNote: await ctx.db.get(legacyNoteId),
      };
    });

    expect(legacyNote?.noteDate).toBe(legacyNote?._creationTime);
    expect(datedNote?.noteDate).toBe(existingNoteDate);
  });

  it("requires a valid migration secret before running", async () => {
    await insertNote({
      content: "legacy note",
      ownerId: ownerA,
    });

    await expect(
      t.mutation(api.migrations.backfillNoteDates.run, {
        cursor: null,
        numItems: 100,
      }),
    ).rejects.toThrow("Missing or invalid migration secret");

    await expect(
      t.mutation(api.migrations.backfillNoteDates.run, {
        cursor: null,
        numItems: 100,
        secret: "wrong-secret",
      }),
    ).rejects.toThrow("Missing or invalid migration secret");

    const authorizedResult = await t.mutation(
      api.migrations.backfillNoteDates.run,
      {
        cursor: null,
        dryRun: true,
        numItems: 100,
        secret: migrationSecret,
      },
    );
    expect(authorizedResult).toMatchObject({
      isDone: true,
      patched: 1,
      scanned: 1,
    });
  });
});
