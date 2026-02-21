import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/auth";
import {
  KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME,
  KRAKEN_DEFAULT_ACCOUNT_ID,
} from "../shared/imports/constants";

type MappingSource = "ibkr" | "kraken";

const mappingSourceValidator = v.union(v.literal("ibkr"), v.literal("kraken"));

const accountMappingValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("accountMappings"),
  accountId: v.string(),
  friendlyName: v.string(),
  ownerId: v.string(),
  source: mappingSourceValidator,
});

const knownAccountValidator = v.object({
  accountId: v.string(),
  inboxTradeCount: v.number(),
  source: mappingSourceValidator,
  tradeCount: v.number(),
});

function normalizeAccountId(value: string): string {
  return value.trim();
}

function normalizeFriendlyName(value: string): string {
  return value.trim();
}

function normalizeSource(value: string): MappingSource {
  if (value !== "ibkr" && value !== "kraken") {
    throw new Error("Invalid brokerage source");
  }
  return value;
}

function normalizeAccountIdForSource(
  source: MappingSource,
  accountId: string | undefined,
): string | undefined {
  const normalizedAccountId = accountId?.trim() || undefined;
  if (source === "kraken") {
    return normalizedAccountId ?? KRAKEN_DEFAULT_ACCOUNT_ID;
  }
  return normalizedAccountId;
}

export const listAccountMappings = query({
  args: {},
  returns: v.array(accountMappingValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const mappings = await ctx.db
      .query("accountMappings")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();

    return [...mappings].sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.accountId.localeCompare(b.accountId) ||
        a.friendlyName.localeCompare(b.friendlyName),
    );
  },
});

export const listKnownBrokerageAccounts = query({
  args: {},
  returns: v.array(knownAccountValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);

    const [trades, inboxTrades] = await Promise.all([
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

    const accounts = new Map<
      string,
      {
        source: MappingSource;
        accountId: string;
        tradeCount: number;
        inboxTradeCount: number;
      }
    >();

    for (const trade of trades) {
      const source = trade.source;
      if (source !== "ibkr" && source !== "kraken") {
        continue;
      }
      const accountId = normalizeAccountIdForSource(
        source,
        trade.brokerageAccountId,
      );
      if (!accountId) continue;

      const key = `${source}|${accountId}`;
      const existing = accounts.get(key);
      if (existing) {
        existing.tradeCount += 1;
      } else {
        accounts.set(key, {
          accountId,
          inboxTradeCount: 0,
          source,
          tradeCount: 1,
        });
      }
    }

    for (const trade of inboxTrades) {
      const accountId = normalizeAccountIdForSource(
        trade.source,
        trade.brokerageAccountId,
      );
      if (!accountId) {
        continue;
      }

      const key = `${trade.source}|${accountId}`;
      const existing = accounts.get(key);
      if (existing) {
        existing.inboxTradeCount += 1;
      } else {
        accounts.set(key, {
          accountId,
          inboxTradeCount: 1,
          source: trade.source,
          tradeCount: 0,
        });
      }
    }

    return Array.from(accounts.values()).sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.accountId.localeCompare(b.accountId),
    );
  },
});

export const upsertAccountMapping = mutation({
  args: {
    accountId: v.string(),
    friendlyName: v.string(),
    source: mappingSourceValidator,
  },
  returns: v.id("accountMappings"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    const source = normalizeSource(args.source);
    const accountId = normalizeAccountIdForSource(
      source,
      normalizeAccountId(args.accountId),
    );
    const friendlyNameInput = normalizeFriendlyName(args.friendlyName);
    const friendlyName =
      source === "kraken" && !friendlyNameInput
        ? KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME
        : friendlyNameInput;

    if (!accountId) {
      throw new Error("Account ID is required");
    }

    if (!friendlyName) {
      throw new Error("Friendly name is required");
    }

    const existing = await ctx.db
      .query("accountMappings")
      .withIndex("by_owner_source_accountId", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("source", source)
          .eq("accountId", accountId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        friendlyName,
      });
      return existing._id;
    }

    return await ctx.db.insert("accountMappings", {
      accountId,
      friendlyName,
      ownerId,
      source,
    });
  },
});
