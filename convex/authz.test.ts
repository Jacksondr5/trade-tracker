// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
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

describe("cross-owner authorization boundaries", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  function asUser(ownerId: string) {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertCampaign(ownerId: string): Promise<Id<"campaigns">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("campaigns", {
        name: `${ownerId} campaign`,
        ownerId,
        status: "active",
        thesis: `${ownerId} thesis`,
      });
    });
  }

  async function insertInboxTrade(ownerId: string): Promise<Id<"inboxTrades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("inboxTrades", {
        ownerId,
        source: "manual",
        status: "pending_review",
        validationErrors: [],
        validationWarnings: [],
      });
    });
  }

  async function insertPortfolio(ownerId: string): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name: `${ownerId} portfolio`,
        ownerId,
      });
    });
  }

  async function insertTrade(args: {
    ownerId: string;
    portfolioId?: Id<"portfolios">;
    tradePlanId?: Id<"tradePlans">;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        date: Date.UTC(2026, 7, 16),
        direction: "long",
        ownerId: args.ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: "manual",
        ticker: "AAPL",
        tradePlanId: args.tradePlanId,
      });
    });
  }

  async function insertTradePlan(ownerId: string): Promise<Id<"tradePlans">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("tradePlans", {
        instrumentSymbol: "AAPL",
        name: `${ownerId} trade plan`,
        ownerId,
        status: "active",
      });
    });
  }

  it("prevents another identity from reading, updating, or deleting a portfolio", async () => {
    const portfolioId = await asUser(ownerA).mutation(
      api.portfolios.createPortfolio,
      { name: "Owner A portfolio" },
    );

    await expect(
      asUser(ownerB).query(api.portfolios.getPortfolioDetail, { portfolioId }),
    ).resolves.toBeNull();
    await expect(
      asUser(ownerB).mutation(api.portfolios.updatePortfolio, {
        name: "Hijacked",
        portfolioId,
      }),
    ).rejects.toThrow("Portfolio not found");
    await expect(
      asUser(ownerB).mutation(api.portfolios.deletePortfolio, { portfolioId }),
    ).rejects.toThrow("Portfolio not found");

    await expect(
      asUser(ownerA).query(api.portfolios.getPortfolioDetail, { portfolioId }),
    ).resolves.toMatchObject({
      portfolio: { name: "Owner A portfolio", ownerId: ownerA },
    });
  });

  it("prevents another identity from reading or changing an import task", async () => {
    const taskId = await asUser(ownerA).mutation(
      api.importTasks.createImportTask,
      {
        mode: "create",
        pastedText: "owner A import",
      },
    );

    await expect(
      asUser(ownerB).query(api.importTasks.listImportTasks, {}),
    ).resolves.toEqual([]);
    await expect(
      asUser(ownerB).mutation(api.importTasks.failImportTask, {
        error: "hijacked",
        taskId,
      }),
    ).rejects.toThrow("Import task not found");

    await expect(
      asUser(ownerA).query(api.importTasks.listImportTasks, {}),
    ).resolves.toMatchObject([{ _id: taskId, status: "pending" }]);
  });

  it("rejects cross-owner parent references when creating import tasks", async () => {
    const tradePlanId = await insertTradePlan(ownerA);
    const inboxTradeId = await insertInboxTrade(ownerA);

    await expect(
      asUser(ownerB).mutation(api.importTasks.createImportTask, {
        mode: "follow-up",
        pastedText: "foreign trade plan",
        tradePlanId,
      }),
    ).rejects.toThrow("Trade plan not found");
    await expect(
      asUser(ownerB).mutation(api.importTasks.createImportTask, {
        inboxTradeId,
        mode: "create",
        pastedText: "foreign inbox trade",
      }),
    ).rejects.toThrow("Inbox trade not found");
  });

  it("rejects cross-owner portfolio and trade-plan references during import", async () => {
    const portfolioId = await insertPortfolio(ownerA);
    const tradePlanId = await insertTradePlan(ownerA);

    await expect(
      asUser(ownerB).mutation(api.imports.importTrades, {
        trades: [{ portfolioId, source: "manual" }],
      }),
    ).rejects.toThrow("Portfolio not found");
    await expect(
      asUser(ownerB).mutation(api.imports.importTrades, {
        trades: [{ source: "manual", tradePlanId }],
      }),
    ).rejects.toThrow("Trade plan not found");
    await expect(
      asUser(ownerB).query(api.imports.listInboxTrades, {}),
    ).resolves.toEqual([]);
  });

  it("prevents bulk updates and parent reassignment across owners", async () => {
    const ownerAPortfolioId = await insertPortfolio(ownerA);
    const ownerATradePlanId = await insertTradePlan(ownerA);
    const ownerATradeId = await insertTrade({
      ownerId: ownerA,
      portfolioId: ownerAPortfolioId,
    });
    const ownerBTradeId = await insertTrade({ ownerId: ownerB });

    const bulkResult = await asUser(ownerB).mutation(
      api.trades.bulkUpdateTrades,
      {
        portfolioId: null,
        tradeIds: [ownerATradeId],
      },
    );
    expect(bulkResult.updated).toBe(0);
    expect(bulkResult.errors).toHaveLength(1);
    expect(bulkResult.errors[0]).toContain("Trade not found");

    await expect(
      asUser(ownerB).mutation(api.trades.updateTrade, {
        portfolioId: ownerAPortfolioId,
        tradeId: ownerBTradeId,
      }),
    ).rejects.toThrow("Portfolio not found");
    await expect(
      asUser(ownerB).mutation(api.trades.updateTrade, {
        tradeId: ownerBTradeId,
        tradePlanId: ownerATradePlanId,
      }),
    ).rejects.toThrow("Trade plan not found");

    await expect(
      asUser(ownerB).query(api.trades.listTrades, {}),
    ).resolves.toMatchObject([
      {
        _id: ownerBTradeId,
      },
    ]);
    const ownerBTrade = await t.run(async (ctx) => {
      return await ctx.db.get(ownerBTradeId);
    });
    expect(ownerBTrade?.portfolioId).toBeUndefined();
    expect(ownerBTrade?.tradePlanId).toBeUndefined();
    await expect(
      asUser(ownerA).query(api.trades.listTrades, {}),
    ).resolves.toMatchObject([
      { _id: ownerATradeId, portfolioId: ownerAPortfolioId },
    ]);
  });

  it("prevents note reads, writes, and parent attachment across owners", async () => {
    const campaignId = await insertCampaign(ownerA);
    const tradePlanId = await insertTradePlan(ownerA);
    const noteId = await asUser(ownerA).mutation(api.notes.addNote, {
      content: "owner A note",
      tradePlanId,
    });

    await expect(
      asUser(ownerB).query(api.notes.getNotesByTradePlan, { tradePlanId }),
    ).resolves.toEqual([]);
    await expect(
      asUser(ownerB).mutation(api.notes.updateNote, {
        content: "hijacked",
        noteId,
      }),
    ).rejects.toThrow("Note not found");
    await expect(
      asUser(ownerB).mutation(api.notes.addNote, {
        campaignId,
        content: "foreign campaign note",
      }),
    ).rejects.toThrow("Campaign not found");
    await expect(
      asUser(ownerB).mutation(api.notes.addNote, {
        content: "foreign trade-plan note",
        tradePlanId,
      }),
    ).rejects.toThrow("Trade plan not found");
  });

  it("keeps account mappings isolated when owners reuse the same natural key", async () => {
    const ownerAMappingId = await asUser(ownerA).mutation(
      api.accountMappings.upsertAccountMapping,
      {
        accountId: "DU123",
        friendlyName: "Owner A account",
        source: "ibkr",
      },
    );

    await expect(
      asUser(ownerB).query(api.accountMappings.listAccountMappings, {}),
    ).resolves.toEqual([]);

    const ownerBMappingId = await asUser(ownerB).mutation(
      api.accountMappings.upsertAccountMapping,
      {
        accountId: "DU123",
        friendlyName: "Owner B account",
        source: "ibkr",
      },
    );
    expect(ownerBMappingId).not.toBe(ownerAMappingId);

    await expect(
      asUser(ownerA).query(api.accountMappings.listAccountMappings, {}),
    ).resolves.toMatchObject([
      {
        _id: ownerAMappingId,
        friendlyName: "Owner A account",
        ownerId: ownerA,
      },
    ]);
    await expect(
      asUser(ownerB).query(api.accountMappings.listAccountMappings, {}),
    ).resolves.toMatchObject([
      {
        _id: ownerBMappingId,
        friendlyName: "Owner B account",
        ownerId: ownerB,
      },
    ]);
  });
});
