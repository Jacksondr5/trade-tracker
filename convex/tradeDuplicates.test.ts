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

const ownerId = "owner-a";
const tradeDay = Date.UTC(2026, 0, 13, 15, 30);

describe("removeDuplicateManualTrade", () => {
  let t: ReturnType<typeof convexTest>;
  let portfolioId: Id<"portfolios">;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    portfolioId = await t.run(async (ctx) =>
      ctx.db.insert("portfolios", { name: "Swing", ownerId }),
    );
  });

  async function insertTrade(
    overrides: Partial<{
      date: number;
      owner: string;
      price: number;
      quantity: number;
      side: "buy" | "sell";
      source: "ibkr" | "manual";
      ticker: string;
    }> = {},
  ) {
    return await t.run(async (ctx) =>
      ctx.db.insert("trades", {
        assetType: "stock",
        date: overrides.date ?? tradeDay,
        direction: "long",
        ownerId: overrides.owner ?? ownerId,
        portfolioId,
        price: overrides.price ?? 100,
        quantity: overrides.quantity ?? 10,
        side: overrides.side ?? "buy",
        source: overrides.source ?? "manual",
        ticker: overrides.ticker ?? "MU",
      }),
    );
  }

  const remove = (
    duplicateTradeId: Id<"trades">,
    survivorTradeId: Id<"trades">,
  ) =>
    t.mutation(internal.tradeDuplicates.removeDuplicateManualTrade, {
      duplicateTradeId,
      ownerId,
      survivorTradeId,
    });

  it("deletes the manual entry and keeps the brokerage import", async () => {
    const manual = await insertTrade();
    const imported = await insertTrade({
      date: tradeDay + 60 * 60 * 1000,
      price: 100.02,
      source: "ibkr",
    });

    const result = await remove(manual, imported);

    expect(result.removed._id).toBe(manual);
    const remaining = await t.run((ctx) => ctx.db.query("trades").collect());
    expect(remaining.map((trade) => trade._id)).toEqual([imported]);
  });

  it("moves price marks to the surviving import", async () => {
    const manual = await insertTrade();
    const imported = await insertTrade({ price: 100.02, source: "ibkr" });
    const markId = await t.run(async (ctx) =>
      ctx.db.insert("portfolioPriceMarks", {
        assetType: "stock",
        createdAt: 1,
        date: "2026-01-13",
        direction: "long",
        ownerId,
        portfolioId,
        price: 100,
        source: "last_trade",
        sourceTradeId: manual,
        symbol: "MU",
        updatedAt: 1,
      }),
    );

    const result = await remove(manual, imported);

    expect(result.priceMarksRepointed).toBe(1);
    const mark = (await t.run((ctx) => ctx.db.get(markId)))!;
    expect(mark.sourceTradeId).toBe(imported);
    expect(mark.price).toBe(100.02);
  });

  it("keeps an open episode's lifecycle in step with its remaining fills", async () => {
    const manual = await insertTrade();
    await t.mutation(internal.threads.backfillThreadsAndEpisodes, { ownerId });
    const episodeId = (await t.run((ctx) => ctx.db.get(manual)))!.episodeId!;
    expect((await t.run((ctx) => ctx.db.get(episodeId)))!.lifecycle).toBe(
      "active",
    );
    const imported = await insertTrade({ source: "ibkr" });

    await remove(manual, imported);

    const episode = (await t.run((ctx) => ctx.db.get(episodeId)))!;
    expect(episode.lifecycle).toBe("idea");
    expect(
      (await t.run((ctx) => ctx.db.get(imported)))!.episodeId,
    ).toBeUndefined();
  });

  it.each([
    ["quantity", { quantity: 11 }],
    ["side", { side: "sell" as const }],
    ["ticker", { ticker: "NVDA" }],
    ["price", { price: 103 }],
    ["trade date", { date: tradeDay + 3 * 24 * 60 * 60 * 1000 }],
  ])("refuses a pair that differs on %s", async (_label, difference) => {
    const manual = await insertTrade();
    const imported = await insertTrade({ source: "ibkr", ...difference });

    await expect(remove(manual, imported)).rejects.toThrow(
      /Not the same execution/,
    );
    expect(await t.run((ctx) => ctx.db.get(manual))).not.toBeNull();
  });

  it("refuses to delete a brokerage import", async () => {
    const first = await insertTrade({ source: "ibkr" });
    const second = await insertTrade({ source: "ibkr" });

    await expect(remove(first, second)).rejects.toThrow(/manual entry/);
  });

  it("refuses to keep a manual entry as the authoritative row", async () => {
    const first = await insertTrade();
    const second = await insertTrade();

    await expect(remove(first, second)).rejects.toThrow(/brokerage import/);
  });

  it("refuses trades that belong to someone else", async () => {
    const manual = await insertTrade({ owner: "owner-b" });
    const imported = await insertTrade({ owner: "owner-b", source: "ibkr" });

    await expect(remove(manual, imported)).rejects.toThrow(/Trade not found/);
  });
});
