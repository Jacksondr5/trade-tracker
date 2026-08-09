import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const MAX_CONNECTIONS_PER_MIGRATION = 100;

export const migrateAccountIdToExpectedAccountIds = internalMutation({
  args: { dryRun: v.boolean() },
  returns: v.object({
    examined: v.number(),
    migrated: v.number(),
    wouldMigrate: v.number(),
  }),
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("brokerageConnections")
      .take(MAX_CONNECTIONS_PER_MIGRATION + 1);
    if (connections.length > MAX_CONNECTIONS_PER_MIGRATION) {
      throw new ConvexError(
        `Brokerage connection migration exceeds its ${MAX_CONNECTIONS_PER_MIGRATION}-document safety bound`,
      );
    }

    let migrated = 0;
    let wouldMigrate = 0;
    for (const connection of connections) {
      if (connection.accountId === undefined) continue;
      wouldMigrate += 1;
      const legacyAccountId = connection.accountId.trim();
      const expectedAccountIds = Array.from(
        new Set([
          ...(connection.expectedAccountIds ?? [])
            .map((accountId) => accountId.trim())
            .filter(Boolean),
          ...(legacyAccountId ? [legacyAccountId] : []),
        ]),
      );
      if (!args.dryRun) {
        await ctx.db.patch(connection._id, {
          accountId: undefined,
          expectedAccountIds:
            expectedAccountIds.length > 0 ? expectedAccountIds : undefined,
          updatedAt: Date.now(),
        });
        migrated += 1;
      }
    }

    return { examined: connections.length, migrated, wouldMigrate };
  },
});

export const verifyAccountIdMigration = internalQuery({
  args: {},
  returns: v.object({
    complete: v.boolean(),
    remainingConnectionIds: v.array(v.id("brokerageConnections")),
    scanned: v.number(),
  }),
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("brokerageConnections")
      .take(MAX_CONNECTIONS_PER_MIGRATION + 1);
    if (connections.length > MAX_CONNECTIONS_PER_MIGRATION) {
      throw new ConvexError(
        `Brokerage connection migration verification exceeds its ${MAX_CONNECTIONS_PER_MIGRATION}-document safety bound`,
      );
    }
    const remainingConnectionIds = connections
      .filter((connection) => connection.accountId !== undefined)
      .map((connection) => connection._id);
    return {
      complete: remainingConnectionIds.length === 0,
      remainingConnectionIds,
      scanned: connections.length,
    };
  },
});
