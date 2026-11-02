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
const day = (n: number) => Date.UTC(2026, 0, n, 15, 30);

describe("moveClosedRoundTrips", () => {
  let t: ReturnType<typeof convexTest>;
  let swing: Id<"portfolios">;
  let bravos: Id<"portfolios">;
  let threadId: Id<"instrumentThreads">;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    [swing, bravos, threadId] = await t.run(async (ctx) => [
      await ctx.db.insert("portfolios", { name: "Swing", ownerId }),
      await ctx.db.insert("portfolios", { name: "Bravos", ownerId }),
      await ctx.db.insert("instrumentThreads", {
        createdAt: day(1),
        createdBy: "system",
        ownerId,
        ticker: "AA",
      }),
    ]);
  });

  // A closed episode holding a buy and a sell of the same size.
  async function seedRoundTrip(args: {
    closeDay: number;
    lifecycle?: "active" | "closed";
    openDay: number;
    portfolioId: Id<"portfolios">;
    sellQuantity?: number;
  }) {
    return await t.run(async (ctx) => {
      const episodeId = await ctx.db.insert("episodes", {
        campaignElementExemptions: [],
        closedAt: day(args.closeDay),
        createdBy: "system",
        direction: "long",
        lifecycle: args.lifecycle ?? "closed",
        openedAt: day(args.openDay),
        ownerId,
        portfolioId: args.portfolioId,
        provenance: "backfill",
        revision: 1,
        source: "user",
        threadId,
        ticker: "AA",
        updatedAt: day(args.closeDay),
      });
      const fill = (side: "buy" | "sell", date: number, quantity: number) =>
        ctx.db.insert("trades", {
          assetType: "stock",
          date,
          direction: "long",
          episodeId,
          ownerId,
          portfolioId: args.portfolioId,
          price: 50,
          quantity,
          side,
          source: "ibkr",
          ticker: "AA",
        });
      const tradeIds = [
        await fill("buy", day(args.openDay), 10),
        await fill("sell", day(args.closeDay), args.sellQuantity ?? 10),
      ];
      return { episodeId, tradeIds };
    });
  }

  function run(
    moves: {
      episodeId: Id<"episodes">;
      expectedTradeIds: Id<"trades">[];
      mergeIntoEpisodeId?: Id<"episodes">;
      toPortfolioId: Id<"portfolios">;
    }[],
    dryRun = false,
  ) {
    return t.mutation(internal.tradePortfolioCorrections.moveClosedRoundTrips, {
      dryRun,
      moves,
      ownerId,
    });
  }

  it("moves an episode whole when the destination has nothing overlapping", async () => {
    const trip = await seedRoundTrip({
      closeDay: 5,
      openDay: 2,
      portfolioId: swing,
    });

    const result = await run([
      {
        episodeId: trip.episodeId,
        expectedTradeIds: trip.tradeIds,
        toPortfolioId: bravos,
      },
    ]);

    expect(result.moves).toEqual([
      {
        episodeDeleted: false,
        fromPortfolioId: swing,
        resultEpisodeId: trip.episodeId,
        resultFillCount: 2,
        ticker: "AA",
        toPortfolioId: bravos,
        tradesMoved: 2,
      },
    ]);
    await t.run(async (ctx) => {
      const episode = await ctx.db.get(trip.episodeId);
      expect(episode).toMatchObject({
        closedAt: day(5),
        lifecycle: "closed",
        openedAt: day(2),
        portfolioId: bravos,
      });
      for (const tradeId of trip.tradeIds) {
        expect(await ctx.db.get(tradeId)).toMatchObject({
          episodeId: trip.episodeId,
          portfolioId: bravos,
        });
      }
    });
  });

  it("merges into the overlapping destination episode, widens its dates, and deletes the empty one", async () => {
    const trip = await seedRoundTrip({
      closeDay: 8,
      openDay: 3,
      portfolioId: swing,
    });
    const existing = await seedRoundTrip({
      closeDay: 6,
      openDay: 2,
      portfolioId: bravos,
    });

    const result = await run([
      {
        episodeId: trip.episodeId,
        expectedTradeIds: trip.tradeIds,
        mergeIntoEpisodeId: existing.episodeId,
        toPortfolioId: bravos,
      },
    ]);

    expect(result.moves[0]).toMatchObject({
      episodeDeleted: true,
      resultEpisodeId: existing.episodeId,
      resultFillCount: 4,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(trip.episodeId)).toBeNull();
      expect(await ctx.db.get(existing.episodeId)).toMatchObject({
        closedAt: day(8),
        lifecycle: "closed",
        openedAt: day(2),
      });
      expect(await ctx.db.get(trip.tradeIds[1]!)).toMatchObject({
        episodeId: existing.episodeId,
        portfolioId: bravos,
      });
    });
  });

  it("changes nothing on a dry run", async () => {
    const trip = await seedRoundTrip({
      closeDay: 8,
      openDay: 3,
      portfolioId: swing,
    });
    const existing = await seedRoundTrip({
      closeDay: 6,
      openDay: 2,
      portfolioId: bravos,
    });

    const result = await run(
      [
        {
          episodeId: trip.episodeId,
          expectedTradeIds: trip.tradeIds,
          mergeIntoEpisodeId: existing.episodeId,
          toPortfolioId: bravos,
        },
      ],
      true,
    );

    expect(result.moves[0]).toMatchObject({
      episodeDeleted: true,
      tradesMoved: 2,
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(trip.episodeId)).toMatchObject({
        portfolioId: swing,
      });
      expect(await ctx.db.get(trip.tradeIds[0]!)).toMatchObject({
        episodeId: trip.episodeId,
        portfolioId: swing,
      });
      expect(await ctx.db.get(existing.episodeId)).toMatchObject({
        closedAt: day(6),
      });
    });
  });

  it("refuses to leave two overlapping episodes in the destination", async () => {
    const trip = await seedRoundTrip({
      closeDay: 8,
      openDay: 3,
      portfolioId: swing,
    });
    await seedRoundTrip({ closeDay: 6, openDay: 2, portfolioId: bravos });

    await expect(
      run([
        {
          episodeId: trip.episodeId,
          expectedTradeIds: trip.tradeIds,
          toPortfolioId: bravos,
        },
      ]),
    ).rejects.toThrow(/overlap/);
  });

  it("refuses a merge whose widened dates reach another destination episode", async () => {
    const trip = await seedRoundTrip({
      closeDay: 12,
      openDay: 3,
      portfolioId: swing,
    });
    const existing = await seedRoundTrip({
      closeDay: 6,
      openDay: 2,
      portfolioId: bravos,
    });
    await seedRoundTrip({ closeDay: 11, openDay: 10, portfolioId: bravos });

    await expect(
      run([
        {
          episodeId: trip.episodeId,
          expectedTradeIds: trip.tradeIds,
          mergeIntoEpisodeId: existing.episodeId,
          toPortfolioId: bravos,
        },
      ]),
    ).rejects.toThrow(/overlap/);
  });

  it("refuses when the episode holds a fill the caller did not name", async () => {
    const trip = await seedRoundTrip({
      closeDay: 5,
      openDay: 2,
      portfolioId: swing,
    });

    await expect(
      run([
        {
          episodeId: trip.episodeId,
          expectedTradeIds: [trip.tradeIds[0]!],
          toPortfolioId: bravos,
        },
      ]),
    ).rejects.toThrow(/expected fills/);
  });

  it("refuses an open episode, an unflat one, and one with an element on it", async () => {
    const open = await seedRoundTrip({
      closeDay: 5,
      lifecycle: "active",
      openDay: 2,
      portfolioId: swing,
    });
    const unflat = await seedRoundTrip({
      closeDay: 9,
      openDay: 7,
      portfolioId: swing,
      sellQuantity: 4,
    });
    const annotated = await seedRoundTrip({
      closeDay: 13,
      openDay: 11,
      portfolioId: swing,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("planElements", {
        actor: "user",
        author: "user",
        createdAt: day(11),
        episodeId: annotated.episodeId,
        ownerId,
        revision: 1,
        source: "conversation",
        statement: "My reasoning for this trade.",
        status: "agreed",
        statusChangedAt: day(11),
        statusRevision: 1,
      });
    });

    const attempt = (trip: {
      episodeId: Id<"episodes">;
      tradeIds: Id<"trades">[];
    }) =>
      run([
        {
          episodeId: trip.episodeId,
          expectedTradeIds: trip.tradeIds,
          toPortfolioId: bravos,
        },
      ]);
    await expect(attempt(open)).rejects.toThrow(/not closed/);
    await expect(attempt(unflat)).rejects.toThrow(/not flat/);
    await expect(attempt(annotated)).rejects.toThrow(/elements/);
  });

  it("applies nothing when a later move in the batch fails", async () => {
    const good = await seedRoundTrip({
      closeDay: 5,
      openDay: 2,
      portfolioId: swing,
    });
    const bad = await seedRoundTrip({
      closeDay: 9,
      openDay: 7,
      portfolioId: swing,
      sellQuantity: 4,
    });

    await expect(
      run([
        {
          episodeId: good.episodeId,
          expectedTradeIds: good.tradeIds,
          toPortfolioId: bravos,
        },
        {
          episodeId: bad.episodeId,
          expectedTradeIds: bad.tradeIds,
          toPortfolioId: bravos,
        },
      ]),
    ).rejects.toThrow(/not flat/);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(good.episodeId)).toMatchObject({
        portfolioId: swing,
      });
    });
  });
});
