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

const rawDateTime = "20260810;093518";
const date = Date.UTC(2026, 7, 10, 13, 35, 18);

const orders = [
  {
    assetCategory: "STK",
    brokerageAccountId: "U1",
    buySell: "SELL",
    currency: "USD",
    executionIds: ["accepted-exec"],
    fees: -1,
    openCloseIndicator: "C",
    orderId: "accepted-order",
    orderType: "MKT",
    price: 120,
    quantity: -1,
    rawDateTime,
    ticker: "NTRA",
  },
  {
    assetCategory: "STK",
    brokerageAccountId: "U1",
    buySell: "BUY",
    currency: "USD",
    executionIds: ["pending-fill-1", "pending-fill-2"],
    fees: -1,
    openCloseIndicator: "O",
    orderId: "pending-order",
    orderType: "LMT",
    price: 106,
    quantity: 5,
    rawDateTime,
    ticker: "KRE",
  },
  {
    assetCategory: "STK",
    brokerageAccountId: "U1",
    buySell: "BUY",
    currency: "USD",
    executionIds: ["pending-single"],
    fees: -0.5,
    openCloseIndicator: "O",
    orderId: "pending-single-order",
    orderType: "MKT",
    price: 50,
    quantity: 2,
    rawDateTime,
    ticker: "XLU",
  },
];

async function seedMigrationRows(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const accepted = await ctx.db.insert("trades", {
      assetType: "stock",
      brokerageAccountId: "U1",
      date,
      direction: "long",
      externalId: "accepted-exec",
      fees: -1,
      orderType: "MKT",
      ownerId: "owner-a",
      price: 120,
      quantity: 1,
      side: "sell",
      source: "ibkr",
      ticker: "NTRA",
    });
    const pendingFill1 = await ctx.db.insert("inboxTrades", {
      assetType: "stock",
      brokerageAccountId: "U1",
      date,
      direction: "long",
      externalId: "pending-fill-1",
      fees: -0.4,
      ownerId: "owner-a",
      price: 100,
      quantity: 2,
      side: "buy",
      source: "ibkr",
      status: "pending_review",
      ticker: "KRE",
      validationErrors: [],
      validationWarnings: ["second warning"],
    });
    const pendingFill2 = await ctx.db.insert("inboxTrades", {
      assetType: "stock",
      brokerageAccountId: "U1",
      date,
      direction: "long",
      externalId: "pending-fill-2",
      fees: -0.6,
      ownerId: "owner-a",
      price: 110,
      quantity: 3,
      side: "buy",
      source: "ibkr",
      status: "pending_review",
      ticker: "KRE",
      validationErrors: [],
      validationWarnings: ["retained warning"],
    });
    const pendingSingle = await ctx.db.insert("inboxTrades", {
      assetType: "stock",
      brokerageAccountId: "U1",
      date,
      direction: "long",
      externalId: "pending-single",
      fees: -0.5,
      ownerId: "owner-a",
      price: 50,
      quantity: 2,
      side: "buy",
      source: "ibkr",
      status: "pending_review",
      ticker: "XLU",
      validationErrors: [],
      validationWarnings: [],
    });
    const csv = await ctx.db.insert("trades", {
      assetType: "stock",
      date,
      direction: "long",
      externalId: "U1|KRE|20260810;093518|50|1",
      ownerId: "owner-a",
      price: 50,
      quantity: 1,
      side: "buy",
      source: "ibkr",
      ticker: "KRE",
    });
    return { accepted, csv, pendingFill1, pendingFill2, pendingSingle };
  });
}

describe("IBKR execution-to-order migration", () => {
  it("dry-runs exact per-table counts, binds approval, and collapses only pending fills", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedMigrationRows(t);
    const bounds = {
      maximumCreationTime: Number.MAX_SAFE_INTEGER,
      minimumCreationTime: 0,
    };

    const dryRun = await t.mutation(
      internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders,
      { dryRun: true, orders, ...bounds },
    );
    expect(dryRun).toMatchObject({
      acceptedOrdersAfter: 1,
      acceptedRowsDeleted: 0,
      acceptedRowsMatched: 1,
      acceptedRowsPlannedToDelete: 0,
      acceptedRowsPlannedToWrite: 1,
      acceptedRowsWritten: 0,
      dryRun: true,
      executionIdsExcludedByMaximumCreationTime: [],
      pendingOrdersAfter: 2,
      pendingRowsDeleted: 0,
      pendingRowsMatched: 3,
      pendingRowsPlannedToDelete: 1,
      pendingRowsPlannedToWrite: 2,
      pendingRowsWritten: 0,
      requestedExecutions: 4,
      requestedOrders: 3,
      safeToExecute: true,
    });
    expect(dryRun.groups).toHaveLength(3);
    expect(
      dryRun.groups.find((group) => group.orderId === "pending-order"),
    ).toMatchObject({
      aggregationMatches: true,
      executionIds: ["pending-fill-1", "pending-fill-2"],
      metadataMatches: true,
      recordState: "pending_review",
      target: { fees: -1, price: 106, quantity: 5 },
    });

    const afterDryRun = await t.run(async (ctx) => ({
      accepted: await ctx.db.get(ids.accepted),
      csv: await ctx.db.get(ids.csv),
      pendingFill1: await ctx.db.get(ids.pendingFill1),
      pendingFill2: await ctx.db.get(ids.pendingFill2),
    }));
    expect(afterDryRun.accepted?.externalId).toBe("accepted-exec");
    expect(afterDryRun.pendingFill1?.externalId).toBe("pending-fill-1");
    expect(afterDryRun.pendingFill2?.externalId).toBe("pending-fill-2");
    expect(afterDryRun.csv?.externalId).toBe("U1|KRE|20260810;093518|50|1");

    await expect(
      t.mutation(internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders, {
        dryRun: false,
        expectedAuditToken: "stale",
        orders,
        ...bounds,
      }),
    ).rejects.toThrow("expectedAuditToken does not match");

    const execution = await t.mutation(
      internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders,
      {
        dryRun: false,
        expectedAuditToken: dryRun.auditToken,
        orders,
        ...bounds,
      },
    );
    expect(execution).toMatchObject({
      acceptedRowsDeleted: 0,
      acceptedRowsWritten: 1,
      dryRun: false,
      pendingRowsDeleted: 1,
      pendingRowsWritten: 2,
    });

    const after = await t.run(async (ctx) => ({
      accepted: await ctx.db
        .query("trades")
        .withIndex("by_source_externalId", (query) =>
          query.eq("source", "ibkr").eq("externalId", "accepted-order"),
        )
        .unique(),
      csv: await ctx.db.get(ids.csv),
      pending: await ctx.db
        .query("inboxTrades")
        .withIndex("by_owner_source_externalId", (query) =>
          query.eq("ownerId", "owner-a").eq("source", "ibkr"),
        )
        .take(10),
    }));
    expect(after.accepted).toMatchObject({
      externalId: "accepted-order",
      price: 120,
      quantity: 1,
      ticker: "NTRA",
    });
    expect(after.pending).toHaveLength(2);
    expect(after.pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: "pending-order",
          fees: -1,
          price: 106,
          quantity: 5,
          status: "pending_review",
          ticker: "KRE",
          validationWarnings: ["retained warning", "second warning"],
        }),
        expect.objectContaining({
          externalId: "pending-single-order",
          status: "pending_review",
          ticker: "XLU",
        }),
      ]),
    );
    expect(after.csv?.externalId).toBe("U1|KRE|20260810;093518|50|1");

    await expect(
      t.mutation(internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders, {
        dryRun: false,
        expectedAuditToken: dryRun.auditToken,
        orders,
        ...bounds,
      }),
    ).rejects.toThrow("did not match stored records one-to-one");
  });

  it("reports reconciliation drift and refuses execution", async () => {
    const t = convexTest(schema, modules);
    await seedMigrationRows(t);
    const changedOrders = orders.map((order) =>
      order.orderId === "pending-order" ? { ...order, price: 106.01 } : order,
    );
    const args = {
      maximumCreationTime: Number.MAX_SAFE_INTEGER,
      minimumCreationTime: 0,
      orders: changedOrders,
    };
    const dryRun = await t.mutation(
      internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders,
      { dryRun: true, ...args },
    );
    expect(dryRun.safeToExecute).toBe(false);
    expect(
      dryRun.groups.find((group) => group.orderId === "pending-order"),
    ).toMatchObject({ aggregationMatches: false, metadataMatches: true });
    await expect(
      t.mutation(internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders, {
        dryRun: false,
        expectedAuditToken: dryRun.auditToken,
        ...args,
      }),
    ).rejects.toThrow("do not reconcile with the supplied order rows");
  });

  it("refuses an accepted multi-fill group and a pre-existing target order id", async () => {
    const t = convexTest(schema, modules);
    await seedMigrationRows(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: "U1",
        date,
        direction: "long",
        externalId: "accepted-exec-2",
        fees: -1,
        ownerId: "owner-a",
        price: 120,
        quantity: 1,
        side: "sell",
        source: "ibkr",
        ticker: "NTRA",
      });
    });
    const acceptedMulti = [
      {
        ...orders[0]!,
        executionIds: ["accepted-exec", "accepted-exec-2"],
        fees: -2,
        quantity: -2,
      },
    ];
    await expect(
      t.mutation(internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders, {
        dryRun: true,
        maximumCreationTime: Number.MAX_SAFE_INTEGER,
        minimumCreationTime: 0,
        orders: acceptedMulti,
      }),
    ).rejects.toThrow("accepted order accepted-order contains multiple");

    await t.run(async (ctx) => {
      await ctx.db.insert("inboxTrades", {
        externalId: "pending-order",
        ownerId: "owner-a",
        source: "ibkr",
        status: "pending_review",
        validationErrors: [],
        validationWarnings: [],
      });
    });
    await expect(
      t.mutation(internal.ibkrOrderMigration.migrateIbkrExecutionsToOrders, {
        dryRun: true,
        maximumCreationTime: Number.MAX_SAFE_INTEGER,
        minimumCreationTime: 0,
        orders,
      }),
    ).rejects.toThrow("target order ids already exist: pending-order");
  });
});
