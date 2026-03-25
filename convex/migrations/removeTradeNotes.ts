/**
 * Batched migration: strip the deprecated `notes` field from `trades` and
 * `inboxTrades` documents.
 *
 * Run via the Convex dashboard (Functions → migrations/removeTradeNotes:start → run).
 */
import { anyApi } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const migrationName = "removeTradeNotes";
const batchSize = 200;

type MigrationTable = "trades" | "inboxTrades";

export const start = internalMutation({
  args: {},
  returns: v.object({
    migrationRunId: v.id("migrationRuns"),
  }),
  handler: async (ctx) => {
    const existingRun = await ctx.db
      .query("migrationRuns")
      .withIndex("by_name", (q) => q.eq("name", migrationName))
      .unique();

    const migrationRunId = existingRun
      ? existingRun._id
      : await ctx.db.insert("migrationRuns", {
          currentTable: "trades",
          inboxTradesPatched: 0,
          name: migrationName,
          status: "running",
          tables: {
            inboxTrades: { cursor: null, done: false },
            trades: { cursor: null, done: false },
          },
          tradesPatched: 0,
        });

    if (!existingRun) {
      await ctx.scheduler.runAfter(0, anyApi.migrations.removeTradeNotes.runNextBatch, {
        migrationRunId,
      });
    }

    return { migrationRunId };
  },
});

export const runNextBatch = internalMutation({
  args: {
    migrationRunId: v.id("migrationRuns"),
  },
  returns: v.object({
    currentTable: v.union(v.literal("trades"), v.literal("inboxTrades")),
    done: v.boolean(),
    inboxTradesPatched: v.number(),
    tradesPatched: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.migrationRunId);
    if (!run) {
      throw new Error("Migration run not found");
    }

    if (run.status === "done") {
      return {
        currentTable: run.currentTable,
        done: true,
        inboxTradesPatched: run.inboxTradesPatched,
        tradesPatched: run.tradesPatched,
      };
    }

    const currentTable = run.currentTable;
    const page = await ctx.db.query(currentTable).paginate({
      cursor: run.tables[currentTable].cursor,
      numItems: batchSize,
    });

    let patchedInBatch = 0;
    for (const doc of page.page) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((doc as any).notes !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.patch(doc._id, { notes: undefined } as any);
        patchedInBatch++;
      }
    }

    const tableDone = page.isDone;
    const nextTable: MigrationTable =
      currentTable === "trades" && tableDone ? "inboxTrades" : currentTable;
    const isMigrationDone = currentTable === "inboxTrades" && tableDone;

    const updatedTables = {
      ...run.tables,
      [currentTable]: {
        cursor: page.continueCursor,
        done: tableDone,
      },
    };

    await ctx.db.patch(args.migrationRunId, {
      currentTable: nextTable,
      inboxTradesPatched:
        run.inboxTradesPatched +
        (currentTable === "inboxTrades" ? patchedInBatch : 0),
      status: isMigrationDone ? "done" : "running",
      tables: updatedTables,
      tradesPatched: run.tradesPatched + (currentTable === "trades" ? patchedInBatch : 0),
    });

    const nextRun = await ctx.db.get(args.migrationRunId);
    if (!nextRun) {
      throw new Error("Migration run disappeared after update");
    }

    if (!isMigrationDone) {
      await ctx.scheduler.runAfter(0, anyApi.migrations.removeTradeNotes.runNextBatch, {
        migrationRunId: args.migrationRunId,
      });
    }

    return {
      currentTable: nextRun.currentTable,
      done: isMigrationDone,
      inboxTradesPatched: nextRun.inboxTradesPatched,
      tradesPatched: nextRun.tradesPatched,
    };
  },
});
