import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  KRAKEN_DEFAULT_ACCOUNT_ID,
} from "../shared/imports/constants";

export const backfillKrakenDefaultAccountIds = mutation({
  args: {},
  returns: v.object({
    createdDefaultMapping: v.boolean(),
    updatedInboxTrades: v.number(),
    updatedTrades: v.number(),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const [trades, pendingInboxTrades] = await Promise.all([
      ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect(),
      ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_status", (q) =>
          q.eq("ownerId", ownerId).eq("status", "pending_review"),
        )
        .collect(),
    ]);

    let updatedTrades = 0;
    for (const trade of trades) {
      if (trade.source !== "kraken") continue;
      if (trade.brokerageAccountId?.trim()) continue;

      await ctx.db.patch(trade._id, {
        brokerageAccountId: KRAKEN_DEFAULT_ACCOUNT_ID,
      });
      updatedTrades += 1;
    }

    let updatedInboxTrades = 0;
    for (const trade of pendingInboxTrades) {
      if (trade.source !== "kraken") continue;
      if (trade.brokerageAccountId?.trim()) continue;

      await ctx.db.patch(trade._id, {
        brokerageAccountId: KRAKEN_DEFAULT_ACCOUNT_ID,
      });
      updatedInboxTrades += 1;
    }

    const hasKrakenRecords =
      updatedTrades > 0 ||
      updatedInboxTrades > 0 ||
      trades.some((trade) => trade.source === "kraken") ||
      pendingInboxTrades.some((trade) => trade.source === "kraken");

    let createdDefaultMapping = false;
    if (hasKrakenRecords) {
      const existingMapping = await ctx.db
        .query("accountMappings")
        .withIndex("by_owner_source_accountId", (q) =>
          q
            .eq("ownerId", ownerId)
            .eq("source", "kraken")
            .eq("accountId", KRAKEN_DEFAULT_ACCOUNT_ID),
        )
        .unique();

      if (!existingMapping) {
        await ctx.db.insert("accountMappings", {
          accountId: KRAKEN_DEFAULT_ACCOUNT_ID,
          friendlyName: KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
          ownerId,
          source: "kraken",
        });
        createdDefaultMapping = true;
      }
    }

    return {
      createdDefaultMapping,
      updatedInboxTrades,
      updatedTrades,
    };
  },
});
