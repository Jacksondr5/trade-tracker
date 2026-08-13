// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
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

const executions = [
  { executionId: "exec-summer", rawDateTime: "20260810;093518" },
  { executionId: "exec-winter", rawDateTime: "20260115;093518" },
];

describe("IBKR trade timestamp correction", () => {
  it("derives exact Flex corrections from raw timestamps and leaves CSV history untouched", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const acceptedFlex = await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 10, 9, 35, 18),
        direction: "long",
        externalId: "exec-summer",
        ownerId: "owner-a",
        price: 50,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker: "KRE",
      });
      const acceptedCsv = await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 10, 13, 35, 18),
        direction: "long",
        externalId: "U1|KRE|20260810;093518|50|1",
        ownerId: "owner-a",
        price: 50,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker: "KRE",
      });
      const acceptedManual = await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 10, 9, 35, 18),
        direction: "long",
        externalId: "exec-summer",
        ownerId: "owner-a",
        price: 50,
        quantity: 1,
        side: "buy",
        source: "manual",
        ticker: "KRE",
      });
      const pendingFlex = await ctx.db.insert("inboxTrades", {
        date: Date.UTC(2026, 0, 15, 9, 35, 18),
        externalId: "exec-winter",
        ownerId: "owner-a",
        source: "ibkr",
        status: "pending_review",
        ticker: "KRE",
        validationErrors: [],
        validationWarnings: [],
      });
      return { acceptedCsv, acceptedFlex, acceptedManual, pendingFlex };
    });

    const dryRun = await t.mutation(
      internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
      {
        dryRun: true,
        executions,
        maximumCreationTime: Number.MAX_SAFE_INTEGER,
        minimumCreationTime: 0,
      },
    );
    expect(dryRun).toMatchObject({
      acceptedTradesCorrected: 1,
      earliestCorrectedTimestamp: Date.UTC(2026, 0, 15, 14, 35, 18),
      earliestStoredTimestamp: Date.UTC(2026, 0, 15, 9, 35, 18),
      latestCorrectedTimestamp: Date.UTC(2026, 7, 10, 13, 35, 18),
      latestStoredTimestamp: Date.UTC(2026, 7, 10, 9, 35, 18),
      maximumCreationTime: Number.MAX_SAFE_INTEGER,
      minimumCreationTime: 0,
      pendingInboxTradesCorrected: 1,
      requestedExecutions: 2,
      safeToExecute: true,
    });
    expect(dryRun.rows).toEqual([
      {
        correctedTimestamp: Date.UTC(2026, 7, 10, 13, 35, 18),
        deltaMs: 4 * 60 * 60 * 1_000,
        executionId: "exec-summer",
        expectedDeltaMs: 4 * 60 * 60 * 1_000,
        matchesExpectedMisparse: true,
        rawDateTime: "20260810;093518",
        recordState: "accepted",
        storedTimestamp: Date.UTC(2026, 7, 10, 9, 35, 18),
        ticker: "KRE",
      },
      {
        correctedTimestamp: Date.UTC(2026, 0, 15, 14, 35, 18),
        deltaMs: 5 * 60 * 60 * 1_000,
        executionId: "exec-winter",
        expectedDeltaMs: 5 * 60 * 60 * 1_000,
        matchesExpectedMisparse: true,
        rawDateTime: "20260115;093518",
        recordState: "pending_review",
        storedTimestamp: Date.UTC(2026, 0, 15, 9, 35, 18),
        ticker: "KRE",
      },
    ]);

    const rowsAfterDryRun = await t.run(async (ctx) => ({
      acceptedCsv: await ctx.db.get(ids.acceptedCsv),
      acceptedFlex: await ctx.db.get(ids.acceptedFlex),
      acceptedManual: await ctx.db.get(ids.acceptedManual),
      pendingFlex: await ctx.db.get(ids.pendingFlex),
    }));
    expect(rowsAfterDryRun.acceptedFlex?.date).toBe(
      Date.UTC(2026, 7, 10, 9, 35, 18),
    );
    expect(rowsAfterDryRun.pendingFlex?.date).toBe(
      Date.UTC(2026, 0, 15, 9, 35, 18),
    );
    expect(rowsAfterDryRun.acceptedCsv?.date).toBe(
      Date.UTC(2026, 7, 10, 13, 35, 18),
    );
    expect(rowsAfterDryRun.acceptedManual?.date).toBe(
      Date.UTC(2026, 7, 10, 9, 35, 18),
    );

    const changedBoundsDryRun = await t.mutation(
      internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
      {
        dryRun: true,
        executions,
        maximumCreationTime: Number.MAX_SAFE_INTEGER - 1,
        minimumCreationTime: 0,
      },
    );
    expect(changedBoundsDryRun.auditToken).not.toBe(dryRun.auditToken);

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: false,
          executions,
          expectedAuditToken: "stale",
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow("expectedAuditToken does not match");

    await t.mutation(
      internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
      {
        dryRun: false,
        executions,
        expectedAuditToken: dryRun.auditToken,
        maximumCreationTime: Number.MAX_SAFE_INTEGER,
        minimumCreationTime: 0,
      },
    );

    const rows = await t.run(async (ctx) => ({
      acceptedCsv: await ctx.db.get(ids.acceptedCsv),
      acceptedFlex: await ctx.db.get(ids.acceptedFlex),
      acceptedManual: await ctx.db.get(ids.acceptedManual),
      pendingFlex: await ctx.db.get(ids.pendingFlex),
    }));
    expect(rows.acceptedFlex?.date).toBe(Date.UTC(2026, 7, 10, 13, 35, 18));
    expect(rows.pendingFlex?.date).toBe(Date.UTC(2026, 0, 15, 14, 35, 18));
    expect(rows.acceptedCsv?.date).toBe(Date.UTC(2026, 7, 10, 13, 35, 18));
    expect(rows.acceptedManual?.date).toBe(Date.UTC(2026, 7, 10, 9, 35, 18));

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: false,
          executions,
          expectedAuditToken: dryRun.auditToken,
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow("does not match the raw report's expected UTC misparse");
  });

  it("reports an unexpected stored timestamp and refuses to execute it", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 10, 9, 35, 17),
        direction: "long",
        externalId: "exec-summer",
        ownerId: "owner-a",
        price: 50,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker: "KRE",
      });
    });

    const dryRun = await t.mutation(
      internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
      {
        dryRun: true,
        executions: [executions[0]!],
        maximumCreationTime: Number.MAX_SAFE_INTEGER,
        minimumCreationTime: 0,
      },
    );
    expect(dryRun.safeToExecute).toBe(false);
    expect(dryRun.rows[0]).toMatchObject({
      deltaMs: 4 * 60 * 60 * 1_000 + 1_000,
      expectedDeltaMs: 4 * 60 * 60 * 1_000,
      matchesExpectedMisparse: false,
    });

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: false,
          executions: [executions[0]!],
          expectedAuditToken: dryRun.auditToken,
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow("does not match the raw report's expected UTC misparse");
  });

  it("refuses a matching execution that predates the first Flex sync", async () => {
    const t = convexTest(schema, modules);
    const creationTime = await t.run(async (ctx) => {
      const id = await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 10, 9, 35, 18),
        direction: "long",
        externalId: "exec-summer",
        ownerId: "owner-a",
        price: 50,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker: "KRE",
      });
      return (await ctx.db.get(id))!._creationTime;
    });

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: true,
          executions: [executions[0]!],
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: creationTime + 1,
        },
      ),
    ).rejects.toThrow("predates the first successful Flex sync");
  });

  it("excludes records created at or after the parser deployment cutoff", async () => {
    const t = convexTest(schema, modules);
    const creationTime = await t.run(async (ctx) => {
      const id = await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 10, 13, 35, 18),
        direction: "long",
        externalId: "exec-summer",
        ownerId: "owner-a",
        price: 50,
        quantity: 1,
        side: "buy",
        source: "ibkr",
        ticker: "KRE",
      });
      return (await ctx.db.get(id))!._creationTime;
    });

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: true,
          executions: [executions[0]!],
          maximumCreationTime: creationTime,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow("did not match stored records one-to-one");
  });

  it("refuses an execution id with no matching stored record", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: true,
          executions: [executions[0]!],
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow("did not match stored records one-to-one");
  });

  it("refuses duplicate stored records for one execution id", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index++) {
        await ctx.db.insert("trades", {
          assetType: "stock",
          date: Date.UTC(2026, 7, 10, 9, 35, 18),
          direction: "long",
          externalId: "exec-summer",
          ownerId: "owner-a",
          price: 50,
          quantity: 1,
          side: "buy",
          source: "ibkr",
          ticker: "KRE",
        });
      }
    });

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: true,
          executions: [executions[0]!],
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow("did not match stored records one-to-one");
  });
});
