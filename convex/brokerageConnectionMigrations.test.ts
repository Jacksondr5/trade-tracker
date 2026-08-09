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

describe("brokerage connection account metadata migration", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  it("dry-runs, migrates, merges, and verifies legacy account IDs", async () => {
    const connectionId = await t.run(async (ctx) => {
      return await ctx.db.insert("brokerageConnections", {
        accountId: " U20360735 ",
        createdAt: 1,
        expectedAccountIds: ["U18731407", "U20360735"],
        ownerId: "owner-a",
        queryId: "123456",
        source: "ibkr",
        status: "active",
        updatedAt: 1,
      });
    });

    await expect(
      t.mutation(
        internal.brokerageConnectionMigrations
          .migrateAccountIdToExpectedAccountIds,
        { dryRun: true },
      ),
    ).resolves.toEqual({ examined: 1, migrated: 0, wouldMigrate: 1 });
    await expect(
      t.run(async (ctx) => ctx.db.get(connectionId)),
    ).resolves.toMatchObject({ accountId: " U20360735 " });

    await expect(
      t.mutation(
        internal.brokerageConnectionMigrations
          .migrateAccountIdToExpectedAccountIds,
        { dryRun: false },
      ),
    ).resolves.toEqual({ examined: 1, migrated: 1, wouldMigrate: 1 });
    await expect(
      t.run(async (ctx) => ctx.db.get(connectionId)),
    ).resolves.toMatchObject({
      expectedAccountIds: ["U18731407", "U20360735"],
    });
    expect(
      await t.run(async (ctx) => ctx.db.get(connectionId)),
    ).not.toHaveProperty("accountId");
    await expect(
      t.query(
        internal.brokerageConnectionMigrations.verifyAccountIdMigration,
        {},
      ),
    ).resolves.toEqual({
      complete: true,
      remainingConnectionIds: [],
      scanned: 1,
    });
  });
});
