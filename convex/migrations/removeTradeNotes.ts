/**
 * One-shot migration: strip the deprecated `notes` field from `trades` and
 * `inboxTrades` documents.
 *
 * Run via the Convex dashboard (Functions → migrations/removeTradeNotes → run).
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: {},
  returns: v.object({
    inboxTradesPatched: v.number(),
    tradesPatched: v.number(),
  }),
  handler: async (ctx) => {
    let tradesPatched = 0;
    let inboxTradesPatched = 0;

    const trades = await ctx.db.query("trades").collect();
    for (const trade of trades) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((trade as any).notes !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.patch(trade._id, { notes: undefined } as any);
        tradesPatched++;
      }
    }

    const inboxTrades = await ctx.db.query("inboxTrades").collect();
    for (const inboxTrade of inboxTrades) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((inboxTrade as any).notes !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.db.patch(inboxTrade._id, { notes: undefined } as any);
        inboxTradesPatched++;
      }
    }

    return { inboxTradesPatched, tradesPatched };
  },
});
