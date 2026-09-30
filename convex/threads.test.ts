// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { emptyPlanSections } from "./lib/planModel";
import {
  draftPlanVersion,
  endorsePlanVersion,
  ensureThread,
  openEpisode,
  recordElements,
  setElementStatus,
  shelveEpisode,
  syncTradeEpisodeLink,
  withOperation,
} from "./lib/planWrites";
import { resolveEpisode } from "./lib/planReads";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

const ownerId = "owner-a";
const asOwner = (t: ReturnType<typeof convexTest>) =>
  t.withIdentity({ tokenIdentifier: ownerId });

describe("instrument threads and episodes", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  async function insertPortfolio(name = "Swing") {
    return await t.run(async (ctx) => ctx.db.insert("portfolios", { name, ownerId }));
  }

  async function insertTrade(args: {
    date: number;
    portfolioId?: Id<"portfolios">;
    quantity: number;
    side: "buy" | "sell";
    ticker?: string;
  }) {
    return await t.run(async (ctx) =>
      ctx.db.insert("trades", {
        assetType: "stock",
        date: args.date,
        direction: "long",
        ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: args.quantity,
        side: args.side,
        source: "ibkr",
        ticker: args.ticker ?? "MU",
      }),
    );
  }

  it("backfills threads and bare episodes per flat-to-flat run and portfolio", async () => {
    const swing = await insertPortfolio("Swing");
    const bravos = await insertPortfolio("Bravos");
    await insertTrade({ date: 1, portfolioId: swing, quantity: 5, side: "buy" });
    await insertTrade({ date: 2, portfolioId: swing, quantity: 5, side: "sell" });
    await insertTrade({ date: 3, portfolioId: swing, quantity: 3, side: "buy" });
    await insertTrade({ date: 4, portfolioId: bravos, quantity: 2, side: "buy" });
    await insertTrade({ date: 5, quantity: 1, side: "buy", ticker: "ORPHAN" });
    await t.run(async (ctx) => {
      await ctx.db.insert("notes", {
        content: "SMH note",
        noteDate: 1,
        ownerId,
        ticker: "SMH",
      });
    });

    const result = await t.mutation(internal.threads.backfillThreadsAndEpisodes, {
      ownerId,
    });
    expect(result).toEqual({
      episodesCreated: 3,
      threadsCreated: 3,
      tradesLinked: 4,
      tradesWithoutPortfolio: 1,
    });

    const page = await asOwner(t).query(api.threads.getThreadPage, { ticker: "mu" });
    expect(page).not.toBeNull();
    expect(page!.history).toHaveLength(1);
    expect(page!.history[0]!.episode.portfolioName).toBe("Swing");
    expect(page!.history[0]!.episode.lifecycle).toBe("closed");
    expect(page!.liveEpisodes.map((e) => e.episode.portfolioName).sort()).toEqual([
      "Bravos",
      "Swing",
    ]);
    const swingLive = page!.liveEpisodes.find(
      (e) => e.episode.portfolioName === "Swing",
    )!;
    expect(swingLive.position).toEqual({
      averageCost: 100,
      direction: "long",
      netQuantity: 3,
      source: "derived_linked_trades",
    });

    // Second run is a no-op.
    expect(
      await t.mutation(internal.threads.backfillThreadsAndEpisodes, { ownerId }),
    ).toEqual({
      episodesCreated: 0,
      threadsCreated: 0,
      tradesLinked: 0,
      tradesWithoutPortfolio: 1,
    });
    const threads = await asOwner(t).query(api.threads.listThreads, {});
    expect(threads.map((thread) => thread.ticker).sort()).toEqual([
      "MU",
      "ORPHAN",
      "SMH",
    ]);
  });

  it("links accepted trades to the open episode and drives lifecycle from fills", async () => {
    const swing = await insertPortfolio();
    const episodeId = await t.run(async (ctx) => {
      const thread = await ensureThread(ctx, ownerId, "NVDA", "counterpart");
      const episode = await openEpisode(ctx, {
        actor: "counterpart",
        openedAt: 5,
        ownerId,
        source: "user",
        threadId: thread._id,
        ticker: "NVDA",
      });
      await recordElements(ctx, {
        actor: "counterpart",
        elements: [
          {
            author: "user",
            kind: "entry",
            statement: "Enter on a convincing breakout",
            status: "agreed",
          },
        ],
        ownerId,
        scope: { episodeId: episode._id, kind: "episode" },
        source: "conversation",
      });
      return episode._id;
    });
    expect((await t.run((ctx) => ctx.db.get(episodeId)))!.lifecycle).toBe(
      "watching",
    );

    await asOwner(t).mutation(api.trades.updateTrade, {
      portfolioId: swing,
      tradeId: await insertTrade({
        date: 10,
        quantity: 20,
        side: "buy",
        ticker: "NVDA",
      }),
    });
    const afterFill = (await t.run((ctx) => ctx.db.get(episodeId)))!;
    expect(afterFill.lifecycle).toBe("active");
    expect(afterFill.portfolioId).toBe(swing);
    expect(afterFill.direction).toBe("long");

    await asOwner(t).mutation(api.trades.updateTrade, {
      portfolioId: swing,
      tradeId: await insertTrade({
        date: 11,
        quantity: 20,
        side: "sell",
        ticker: "NVDA",
      }),
    });
    const closed = (await t.run((ctx) => ctx.db.get(episodeId)))!;
    expect(closed.lifecycle).toBe("closed");
    expect(closed.closedAt).toBe(11);

    // A correction that would reopen or move a closed episode is refused;
    // one that leaves it flat is accepted and refreshes the close date.
    const closingSell = (await t.run((ctx) => ctx.db.query("trades").collect())).find(
      (trade) => trade.episodeId === episodeId && trade.side === "sell",
    )!;
    await expect(
      asOwner(t).mutation(api.trades.updateTrade, { quantity: 19, tradeId: closingSell._id }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(
      asOwner(t).mutation(api.trades.updateTrade, { portfolioId: null, tradeId: closingSell._id }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await asOwner(t).mutation(api.trades.updateTrade, { price: 101, tradeId: closingSell._id });
    const afterFix = (await t.run((ctx) => ctx.db.get(episodeId)))!;
    expect(afterFix.lifecycle).toBe("closed");
    expect(afterFix.closedAt).toBe(11);
    expect((await t.run((ctx) => ctx.db.get(closingSell._id)))!.episodeId).toBe(episodeId);

    // A late fill dated inside the closed episode's span stays unlinked.
    const backdated = await insertTrade({ date: 10, quantity: 1, side: "buy", ticker: "NVDA" });
    await asOwner(t).mutation(api.trades.updateTrade, { portfolioId: swing, tradeId: backdated });
    expect((await t.run((ctx) => ctx.db.get(backdated)))!.episodeId).toBeUndefined();

    // A later fill opens a new episode rather than reopening the closed one.
    await asOwner(t).mutation(api.trades.updateTrade, {
      portfolioId: swing,
      tradeId: await insertTrade({
        date: 12,
        quantity: 1,
        side: "buy",
        ticker: "NVDA",
      }),
    });
    const page = (await asOwner(t).query(api.threads.getThreadPage, {
      ticker: "NVDA",
    }))!;
    expect(page.history).toHaveLength(1);
    expect(page.liveEpisodes).toHaveLength(1);
    expect(page.liveEpisodes[0]!.episode.lifecycle).toBe("active");
    expect(page.liveEpisodes[0]!.episode.id).not.toBe(episodeId);

    // A fill dated before the open episode began is left for the conversation.
    const early = await insertTrade({ date: 11.5, quantity: 1, side: "buy", ticker: "NVDA" });
    await asOwner(t).mutation(api.trades.updateTrade, { portfolioId: swing, tradeId: early });
    expect((await t.run((ctx) => ctx.db.get(early)))!.episodeId).toBeUndefined();
  });

  it("records elements with supersede conflicts, dropping evidence, and idempotent operations", async () => {
    const episodeId = await t.run(async (ctx) => {
      const thread = await ensureThread(ctx, ownerId, "BE", "counterpart");
      return (
        await openEpisode(ctx, {
          actor: "counterpart",
          ownerId,
          source: "user",
          threadId: thread._id,
          ticker: "BE",
        })
      )._id;
    });

    await expect(
      t.run((ctx) =>
        recordElements(ctx, {
          actor: "counterpart",
          elements: [
            {
              author: "user",
              statement: "Stop at $240",
              status: "agreed",
              value: {
                amount: 240,
                provenance: "user_reported",
                scope: "per_share",
                unit: "usd",
              },
            },
          ],
          ownerId,
          scope: { episodeId, kind: "episode" },
          source: "conversation",
        }),
      ),
    ).rejects.toMatchObject({
      data: { code: "VALIDATION" },
    });
    // The counterpart cannot record its own statement as agreed.
    await expect(
      t.run((ctx) =>
        recordElements(ctx, {
          actor: "counterpart",
          elements: [
            { author: "counterpart", statement: "Take the 3% size", status: "agreed" },
          ],
          ownerId,
          scope: { episodeId, kind: "episode" },
          source: "conversation",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION" } });

    const [stopId] = await t.run((ctx) =>
      recordElements(ctx, {
        actor: "counterpart",
        elements: [
          {
            asOf: "2026-09-09",
            author: "user",
            kind: "stop",
            statement: "Broker backstop $240",
            status: "proposed",
            value: {
              amount: 240,
              provenance: "user_reported",
              scope: "per_share",
              stopKind: "broker_order",
              unit: "usd",
            },
          },
        ],
        ownerId,
        scope: { episodeId, kind: "episode" },
        source: "conversation",
      }),
    );

    const first = await t.run((ctx) =>
      withOperation(ctx, { kind: "record-elements", operationId: "op-1", ownerId }, () =>
        recordElements(ctx, {
          actor: "counterpart",
          elements: [
            {
              asOf: "2026-09-09",
              author: "user",
              kind: "stop",
              statement: "Immediate exit on a touch of the 4h line near $240",
              status: "agreed",
              supersedes: stopId!,
            },
          ],
          ownerId,
          scope: { episodeId, kind: "episode" },
          source: "conversation",
        }),
      ),
    );
    expect(first.replayed).toBe(false);
    const replay = await t.run((ctx) =>
      withOperation(ctx, { kind: "record-elements", operationId: "op-1", ownerId }, () =>
        recordElements(ctx, {
          actor: "counterpart",
          elements: [
            {
              asOf: "2026-09-09",
              author: "user",
              statement: "duplicate",
              status: "agreed",
              supersedes: stopId!,
            },
          ],
          ownerId,
          scope: { episodeId, kind: "episode" },
          source: "conversation",
        }),
      ),
    );
    expect(replay).toEqual({ replayed: true, result: first.result });

    await expect(
      t.run((ctx) =>
        recordElements(ctx, {
          actor: "counterpart",
          elements: [
            {
              asOf: "2026-09-10",
              author: "user",
              statement: "another replacement of $240",
              status: "agreed",
              supersedes: stopId!,
            },
          ],
          ownerId,
          scope: { episodeId, kind: "episode" },
          source: "conversation",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    await expect(
      t.run((ctx) =>
        withOperation(ctx, { kind: "shelve-episode", operationId: "op-1", ownerId }, async () => 1),
      ),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    const [targetId] = await t.run((ctx) =>
      recordElements(ctx, {
        actor: "counterpart",
        elements: [
          {
            asOf: "2026-09-09",
            author: "user",
            kind: "target",
            statement: "~$370 cup-and-handle objective",
            status: "proposed",
          },
        ],
        ownerId,
        scope: { episodeId, kind: "episode" },
        source: "conversation",
      }),
    );
    await expect(
      t.run((ctx) =>
        setElementStatus(ctx, {
          actor: "counterpart",
          elementId: targetId!,
          ownerId,
          status: "dropped",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION" } });
    const dropped = await t.run((ctx) =>
      setElementStatus(ctx, {
        actor: "counterpart",
        elementId: targetId!,
        evidence: "Jackson: the $370 objective is not well defined, drop it",
        ownerId,
        status: "dropped",
      }),
    );
    expect(dropped.status).toBe("dropped");
    expect(dropped.statusEvidence).toContain("drop it");
    // Agreed never flips back to proposed.
    await expect(
      t.run((ctx) =>
        setElementStatus(ctx, {
          actor: "counterpart",
          elementId: first.result[0]!,
          ownerId,
          status: "agreed",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });

    const resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(episodeId))!),
    );
    const statuses = Object.fromEntries(
      resolved.itemsSinceCheckpoint.map((item) => [item.statement, item.status]),
    );
    expect(statuses["Broker backstop $240"]).toBe("superseded");
    expect(statuses["~$370 cup-and-handle objective"]).toBe("dropped");
    expect(
      resolved.itemsSinceCheckpoint.find((item) => item.id === stopId)!
        .supersededById,
    ).toBe(first.result[0]);
  });

  it("drafts, endorses, and partitions elements around the checkpoint", async () => {
    const episodeId = await t.run(async (ctx) => {
      const thread = await ensureThread(ctx, ownerId, "SNDK", "counterpart");
      return (
        await openEpisode(ctx, {
          actor: "counterpart",
          ownerId,
          source: "user",
          threadId: thread._id,
          ticker: "SNDK",
        })
      )._id;
    });
    const [ruleId] = await t.run((ctx) =>
      recordElements(ctx, {
        actor: "counterpart",
        elements: [
          {
            author: "user",
            statement: "Add only on a credible higher support",
            status: "agreed",
          },
          {
            asOf: "2026-09-08",
            author: "counterpart",
            statement: "Illustrative R table to $1,410",
            status: "proposed",
          },
        ],
        ownerId,
        scope: { episodeId, kind: "episode" },
        source: "conversation",
      }),
    );

    await expect(
      t.run((ctx) =>
        draftPlanVersion(ctx, {
          actor: "counterpart",
          endorsed: true,
          episodeId,
          ownerId,
          sections: emptyPlanSections(),
          source: "conversation",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION" } });

    const draft = await t.run((ctx) =>
      draftPlanVersion(ctx, {
        actor: "counterpart",
        endorsed: false,
        episodeId,
        ownerId,
        sections: {
          ...emptyPlanSections(),
          scenarios: [{ elementId: ruleId, text: "Add only on a credible higher support" }],
          stop: [{ asOf: "2026-09-09", text: "Broker stop $1,410" }],
        },
        source: "conversation",
      }),
    );
    expect(draft.versionNumber).toBe(1);
    expect(draft.endorsed).toBe(false);

    let resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(episodeId))!),
    );
    expect(resolved.checkpoint).toBeNull();
    expect(resolved.draft?.versionNumber).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(episodeId)))!.lifecycle).toBe("idea");

    await expect(
      t.run((ctx) =>
        endorsePlanVersion(ctx, {
          actor: "counterpart",
          episodeId,
          ownerId,
          versionNumber: 2,
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(
      t.run((ctx) =>
        endorsePlanVersion(ctx, { actor: "agent", episodeId, ownerId, versionNumber: 1 }),
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION" } });
    await expect(
      t.run((ctx) =>
        draftPlanVersion(ctx, {
          actor: "counterpart",
          compiledThroughRevision: 1_000_000,
          endorsed: false,
          episodeId,
          ownerId,
          sections: emptyPlanSections(),
          source: "conversation",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "VALIDATION" } });
    const endorsed = await t.run((ctx) =>
      endorsePlanVersion(ctx, {
        actor: "counterpart",
        episodeId,
        ownerId,
        versionNumber: 1,
      }),
    );
    expect(endorsed.endorsedBy).toBe("user");
    expect(endorsed.endorsementActor).toBe("counterpart");
    expect((await t.run((ctx) => ctx.db.get(episodeId)))!.lifecycle).toBe(
      "watching",
    );

    await t.run((ctx) =>
      recordElements(ctx, {
        actor: "counterpart",
        elements: [
          {
            asOf: "2026-09-14",
            author: "user",
            statement: "Fell out of the channel on 09-14, hold",
            status: "agreed",
          },
        ],
        ownerId,
        scope: { episodeId, kind: "episode" },
        source: "conversation",
      }),
    );
    resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(episodeId))!),
    );
    expect(resolved.checkpoint?.versionNumber).toBe(1);
    expect(resolved.draft).toBeNull();
    expect(resolved.itemsSinceCheckpoint.map((item) => item.statement)).toEqual([
      "Fell out of the channel on 09-14, hold",
    ]);
    expect(
      resolved.openProposals.map((item) => [item.statement, item.beforeCheckpoint]),
    ).toEqual([["Illustrative R table to $1,410", true]]);
    expect(resolved.history.total).toBe(2);

    // A draft compiled before a later agreed element cannot be endorsed.
    await t.run((ctx) =>
      draftPlanVersion(ctx, {
        actor: "counterpart",
        compiledThroughRevision: resolved.checkpoint!.compiledThroughRevision,
        endorsed: false,
        episodeId,
        ownerId,
        sections: emptyPlanSections(),
        source: "conversation",
      }),
    );
    await expect(
      t.run((ctx) =>
        endorsePlanVersion(ctx, {
          actor: "counterpart",
          episodeId,
          ownerId,
          versionNumber: 2,
        }),
      ),
    ).rejects.toMatchObject({
      data: { code: "CONFLICT", details: { staleAgreedElementIds: expect.any(Array) } },
    });

    // A user edit in the app becomes a new endorsed version, but only when
    // it was opened from the latest version and has seen every change.
    resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(episodeId))!),
    );
    const stale = asOwner(t).mutation(api.threads.savePlanVersionFromApp, {
      baseVersionNumber: 1,
      episodeId,
      observedRevision: resolved.latestRevision,
      sections: emptyPlanSections(),
    });
    await expect(stale).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const unseen = asOwner(t).mutation(api.threads.savePlanVersionFromApp, {
      baseVersionNumber: 2,
      episodeId,
      observedRevision: 1,
      sections: emptyPlanSections(),
    });
    await expect(unseen).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const edited = await asOwner(t).mutation(api.threads.savePlanVersionFromApp, {
      baseVersionNumber: 2,
      episodeId,
      observedRevision: resolved.latestRevision,
      sections: { ...emptyPlanSections(), stop: [{ text: "Stop moved to $1,430", asOf: "2026-09-15" }] },
    });
    expect(edited.versionNumber).toBe(3);
    expect(edited.endorsed).toBe(true);
    expect(edited.draftedBy).toBe("user");
    expect(edited.endorsementActor).toBe("user");
    resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(episodeId))!),
    );
    expect(resolved.checkpoint?.versionNumber).toBe(3);
    expect(resolved.itemsSinceCheckpoint).toEqual([]);
  });

  it("shelves only unfilled ideas and the desk groups by campaign with exemptions applied", async () => {
    const swing = await insertPortfolio();
    const { campaignId, exempted, filled } = await t.run(async (ctx) => {
      const campaignId = await ctx.db.insert("campaigns", {
        name: "Semis",
        ownerId,
        status: "active",
        thesis: "Semis reforming",
      });
      const [gateId] = await recordElements(ctx, {
        actor: "counterpart",
        elements: [
          { author: "user", kind: "rule", statement: "Adds require SMH confirmation", status: "agreed" },
        ],
        ownerId,
        scope: { campaignId, kind: "campaign" },
        source: "conversation",
      });
      const beThread = await ensureThread(ctx, ownerId, "BE", "counterpart");
      const exempted = await openEpisode(ctx, {
        actor: "counterpart",
        campaignId,
        ownerId,
        source: "user",
        threadId: beThread._id,
        ticker: "BE",
      });
      await ctx.db.patch(exempted._id, { campaignElementExemptions: [gateId!] });
      const muThread = await ensureThread(ctx, ownerId, "MU", "counterpart");
      const filled = await openEpisode(ctx, {
        actor: "counterpart",
        campaignId,
        openedAt: 0,
        ownerId,
        portfolioId: swing,
        source: "user",
        threadId: muThread._id,
        ticker: "MU",
      });
      return { campaignId, exempted: exempted._id, filled: filled._id };
    });
    await asOwner(t).mutation(api.trades.updateTrade, {
      portfolioId: swing,
      tradeId: await insertTrade({ date: 1, quantity: 5, side: "buy", ticker: "MU" }),
    });

    const shelve = (episodeId: Id<"episodes">, shelved: boolean) =>
      t.run((ctx) =>
        shelveEpisode(ctx, { actor: "counterpart", episodeId, ownerId, shelved, source: "conversation" }),
      );
    await expect(shelve(filled, true)).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect((await shelve(exempted, true)).shelvedBy).toBe("counterpart");

    let desk = await asOwner(t).query(api.threads.getDesk, {});
    expect(desk.groups).toHaveLength(1);
    expect(desk.groups[0]!.campaign?.id).toBe(campaignId);
    expect(desk.groups[0]!.campaign?.rules.map((rule) => rule.statement)).toEqual([
      "Adds require SMH confirmation",
    ]);
    expect(desk.groups[0]!.rows.map((row) => row.episode.ticker)).toEqual(["MU"]);
    expect(desk.groups[0]!.rows[0]!.checkpoint).toBeNull();
    expect(desk.groups[0]!.rows[0]!.position?.netQuantity).toBe(5);

    await shelve(exempted, false);
    desk = await asOwner(t).query(api.threads.getDesk, {});
    expect(desk.groups[0]!.rows.map((row) => row.episode.ticker)).toEqual(["MU", "BE"]);

    const resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(exempted))!),
    );
    expect(resolved.campaignRules.applicable).toEqual([]);
    expect(resolved.campaignRules.exempted.map((rule) => rule.statement)).toEqual([
      "Adds require SMH confirmation",
    ]);
  });

  it("keeps deliberately unlinked fills unlinked on backfill reruns and orders bulk links by date", async () => {
    const swing = await insertPortfolio();
    const buy = await insertTrade({ date: 100, portfolioId: swing, quantity: 5, side: "buy", ticker: "TSM" });
    const sell = await insertTrade({ date: 200, portfolioId: swing, quantity: 5, side: "sell", ticker: "TSM" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, buy));
    await t.run((ctx) => syncTradeEpisodeLink(ctx, sell));
    // A late fill inside the closed span stays unlinked...
    const late = await insertTrade({ date: 150, portfolioId: swing, quantity: 1, side: "buy", ticker: "TSM" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, late));
    expect((await t.run((ctx) => ctx.db.get(late)))!.episodeId).toBeUndefined();
    // ...and a backfill rerun does not turn it into a phantom episode.
    const rerun = await t.mutation(internal.threads.backfillThreadsAndEpisodes, { ownerId });
    expect(rerun.episodesCreated).toBe(0);
    expect((await t.run((ctx) => ctx.db.get(late)))!.episodeId).toBeUndefined();

    // Bulk assignment links oldest fills first regardless of selection order.
    const laterBuy = await insertTrade({ date: 300, quantity: 2, side: "buy", ticker: "AMD" });
    const laterSell = await insertTrade({ date: 400, quantity: 2, side: "sell", ticker: "AMD" });
    const result = await asOwner(t).mutation(api.trades.bulkUpdateTrades, {
      portfolioId: swing,
      tradeIds: [laterSell, laterBuy],
    });
    expect(result).toEqual({ errors: [], updated: 2 });
    const amdBuy = (await t.run((ctx) => ctx.db.get(laterBuy)))!;
    const amdSell = (await t.run((ctx) => ctx.db.get(laterSell)))!;
    expect(amdBuy.episodeId).toBeDefined();
    expect(amdSell.episodeId).toBe(amdBuy.episodeId);
    expect((await t.run((ctx) => ctx.db.get(amdBuy.episodeId!)))!.lifecycle).toBe("closed");

    // Every traded ticker has a thread, even one whose fills stay unlinked.
    const orphan = await insertTrade({ date: 500, quantity: 1, side: "buy", ticker: "ORPH" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, orphan));
    expect(
      await asOwner(t).query(api.threads.getThreadPage, { ticker: "ORPH" }),
    ).not.toBeNull();
  });

  it("keeps the checkpoint when drafts push it out of the bounded version window", async () => {
    const episodeId = await t.run(async (ctx) => {
      const thread = await ensureThread(ctx, ownerId, "STX", "counterpart");
      return (
        await openEpisode(ctx, {
          actor: "counterpart",
          ownerId,
          source: "user",
          threadId: thread._id,
          ticker: "STX",
        })
      )._id;
    });
    await t.run(async (ctx) => {
      await draftPlanVersion(ctx, {
        actor: "counterpart",
        endorsed: false,
        episodeId,
        ownerId,
        sections: { ...emptyPlanSections(), stop: [{ text: "Stop ~760", asOf: "2026-09-20" }] },
        source: "conversation",
      });
      await endorsePlanVersion(ctx, { actor: "counterpart", episodeId, ownerId, versionNumber: 1 });
      for (let i = 0; i < 205; i += 1) {
        await draftPlanVersion(ctx, {
          actor: "counterpart",
          endorsed: false,
          episodeId,
          ownerId,
          sections: emptyPlanSections(),
          source: "conversation",
        });
      }
    });
    const resolved = await t.run(async (ctx) =>
      resolveEpisode(ctx, (await ctx.db.get(episodeId))!),
    );
    expect(resolved.checkpoint?.versionNumber).toBe(1);
    expect(resolved.draft?.versionNumber).toBe(206);
    expect(resolved.planVersionsTruncated).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(episodeId)))!.lifecycle).toBe("watching");
  });

  it("reports truncation on thread notes instead of hiding older thread notes", async () => {
    const swing = await insertPortfolio();
    const { episodeId, threadId } = await t.run(async (ctx) => {
      const thread = await ensureThread(ctx, ownerId, "WAB", "counterpart");
      const episode = await openEpisode(ctx, {
        actor: "counterpart",
        ownerId,
        portfolioId: swing,
        source: "user",
        threadId: thread._id,
        ticker: "WAB",
      });
      await ctx.db.insert("notes", {
        content: "old thread note",
        noteDate: 1,
        ownerId,
        threadId: thread._id,
        ticker: "WAB",
      });
      for (let i = 0; i < 1_001; i += 1) {
        await ctx.db.insert("notes", {
          content: `episode note ${i}`,
          episodeId: episode._id,
          noteDate: 10 + i,
          ownerId,
          ticker: "WAB",
        });
      }
      return { episodeId: episode._id, threadId: thread._id };
    });
    const threadNotes = await asOwner(t).query(api.notes.getNotesByThread, { threadId });
    expect(threadNotes.truncated).toBe(true);
    expect(threadNotes.items.map((note) => note.content)).toEqual(["old thread note"]);
    const episodeNotes = await asOwner(t).query(api.notes.getNotesByEpisode, { episodeId });
    expect(episodeNotes.truncated).toBe(true);
    expect(episodeNotes.items).toHaveLength(200);
    const page = (await asOwner(t).query(api.threads.getThreadPage, { ticker: "WAB" }))!;
    expect(page.notes.truncated).toBe(true);
    expect(page.notes.items.map((note) => note.content)).toEqual(["old thread note"]);
  });

  it("refuses portfolio deletion under episodes and re-applies date rules to corrected fills", async () => {
    const swing = await insertPortfolio();
    const buy = await insertTrade({ date: 10, portfolioId: swing, quantity: 10, side: "buy", ticker: "CF" });
    const sell = await insertTrade({ date: 20, portfolioId: swing, quantity: 10, side: "sell", ticker: "CF" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, buy));
    await t.run((ctx) => syncTradeEpisodeLink(ctx, sell));
    const later = await insertTrade({ date: 30, portfolioId: swing, quantity: 10, side: "buy", ticker: "CF" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, later));
    const activeEpisodeId = (await t.run((ctx) => ctx.db.get(later)))!.episodeId!;
    expect((await t.run((ctx) => ctx.db.get(activeEpisodeId)))!.lifecycle).toBe("active");

    // A portfolio with live or closed episodes cannot be deleted from under them.
    await expect(
      asOwner(t).mutation(api.portfolios.deletePortfolio, { portfolioId: swing }),
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect(await t.run((ctx) => ctx.db.get(swing))).not.toBeNull();

    // Correcting the active fill's date into the closed span unlinks it.
    await asOwner(t).mutation(api.trades.updateTrade, { date: 15, tradeId: later });
    expect((await t.run((ctx) => ctx.db.get(later)))!.episodeId).toBeUndefined();
    const formerlyActive = (await t.run((ctx) => ctx.db.get(activeEpisodeId)))!;
    expect(formerlyActive.lifecycle).not.toBe("active");
    expect(formerlyActive.openedAt).toBe(30);

    // A correction that stays after the closed span keeps its link.
    const again = await insertTrade({ date: 40, portfolioId: swing, quantity: 1, side: "buy", ticker: "CF" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, again));
    const againEpisode = (await t.run((ctx) => ctx.db.get(again)))!.episodeId!;
    await asOwner(t).mutation(api.trades.updateTrade, { date: 45, tradeId: again });
    expect((await t.run((ctx) => ctx.db.get(again)))!.episodeId).toBe(againEpisode);
  });

  it("leaves an unmatched closing fill unlinked and lets trade-less episodes release a portfolio", async () => {
    const swing = await insertPortfolio();
    // A sell with no open episode to close never starts one.
    const orphanSell = await insertTrade({ date: 50, portfolioId: swing, quantity: 5, side: "sell", ticker: "EOG" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, orphanSell));
    expect((await t.run((ctx) => ctx.db.get(orphanSell)))!.episodeId).toBeUndefined();
    const eogPage = (await asOwner(t).query(api.threads.getThreadPage, { ticker: "EOG" }))!;
    expect(eogPage.liveEpisodes).toEqual([]);

    // An idea that only named the portfolio does not block deleting it.
    const spare = await insertPortfolio("Spare");
    const ideaId = await t.run(async (ctx) => {
      const thread = await ensureThread(ctx, ownerId, "IBB", "counterpart");
      return (
        await openEpisode(ctx, {
          actor: "counterpart",
          ownerId,
          portfolioId: spare,
          source: "user",
          threadId: thread._id,
          ticker: "IBB",
        })
      )._id;
    });
    await asOwner(t).mutation(api.portfolios.deletePortfolio, { portfolioId: spare });
    expect(await t.run((ctx) => ctx.db.get(spare))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(ideaId)))!.portfolioId).toBeUndefined();

    // A portfolio with trade history stays, and says why.
    const buy = await insertTrade({ date: 60, portfolioId: swing, quantity: 5, side: "buy", ticker: "EOG" });
    await t.run((ctx) => syncTradeEpisodeLink(ctx, buy));
    await expect(
      asOwner(t).mutation(api.portfolios.deletePortfolio, { portfolioId: swing }),
    ).rejects.toMatchObject({
      data: { code: "CONFLICT", message: expect.stringContaining("trade history") },
    });
  });
});
