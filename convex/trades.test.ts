// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { KRAKEN_DEFAULT_ACCOUNT_ID } from "../shared/imports/constants";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob("./**/*.*s");

describe("trades filters", () => {
  const ownerId = "owner-a";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  function asUser() {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertPortfolio(name: string): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name,
        ownerId,
      });
    });
  }

  async function insertTrade(args: {
    brokerageAccountId?: string;
    date: number;
    portfolioId?: Id<"portfolios">;
    source?: "ibkr" | "kraken" | "manual";
    ticker: string;
  }): Promise<Id<"trades">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("trades", {
        assetType: "stock",
        brokerageAccountId: args.brokerageAccountId,
        date: args.date,
        direction: "long",
        ownerId,
        portfolioId: args.portfolioId,
        price: 100,
        quantity: 1,
        side: "buy",
        source: args.source ?? "manual",
        ticker: args.ticker,
      });
    });
  }

  it("filters by partial ticker across multiple pages without skipping matches", async () => {
    await insertTrade({ date: Date.UTC(2026, 2, 6), ticker: "AMD" });
    await insertTrade({ date: Date.UTC(2026, 2, 5), ticker: "AAPL" });
    await insertTrade({ date: Date.UTC(2026, 2, 4), ticker: "MSFT" });
    await insertTrade({ date: Date.UTC(2026, 2, 3), ticker: "AAPL" });
    await insertTrade({ date: Date.UTC(2026, 2, 2), ticker: "TSLA" });
    await insertTrade({ date: Date.UTC(2026, 2, 1), ticker: "AAPL" });

    const user = asUser();

    const firstPage = await user.query(api.trades.listTradesPage, {
      paginationOpts: {
        cursor: null,
        numItems: 2,
      },
      ticker: "aa",
    });

    expect(firstPage.page.map((trade) => trade.ticker)).toEqual(["AAPL", "AAPL"]);
    expect(firstPage.isDone).toBe(false);

    const secondPage = await user.query(api.trades.listTradesPage, {
      paginationOpts: {
        cursor: firstPage.continueCursor,
        numItems: 2,
      },
      ticker: "aa",
    });

    expect(secondPage.page.map((trade) => trade.ticker)).toEqual(["AAPL"]);
    expect(secondPage.isDone).toBe(true);
  });

  it("combines date, portfolio, and account filters", async () => {
    const retirementPortfolio = await insertPortfolio("Retirement");
    const tradingPortfolio = await insertPortfolio("Trading");

    await insertTrade({
      brokerageAccountId: "DU111",
      date: Date.UTC(2026, 2, 8),
      portfolioId: retirementPortfolio,
      source: "ibkr",
      ticker: "NVDA",
    });
    await insertTrade({
      brokerageAccountId: "DU111",
      date: Date.UTC(2026, 2, 7),
      portfolioId: tradingPortfolio,
      source: "ibkr",
      ticker: "NVDA",
    });
    await insertTrade({
      brokerageAccountId: "DU222",
      date: Date.UTC(2026, 2, 8),
      portfolioId: retirementPortfolio,
      source: "ibkr",
      ticker: "NVDA",
    });
    await insertTrade({
      brokerageAccountId: "DU111",
      date: Date.UTC(2026, 1, 28),
      portfolioId: retirementPortfolio,
      source: "ibkr",
      ticker: "NVDA",
    });
    await insertTrade({
      brokerageAccountId: "DU111",
      date: Date.UTC(2026, 2, 8),
      portfolioId: retirementPortfolio,
      source: "ibkr",
      ticker: "AAPL",
    });

    const result = await asUser().query(api.trades.listTradesPage, {
      accountId: "DU111",
      accountSource: "ibkr",
      endDate: Date.UTC(2026, 2, 9, 23, 59, 59, 999),
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
      portfolioId: retirementPortfolio,
      startDate: Date.UTC(2026, 2, 1),
      ticker: "nvd",
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({
      brokerageAccountId: "DU111",
      portfolioId: retirementPortfolio,
      source: "ibkr",
      ticker: "NVDA",
    });
  });

  it("filters trades with no portfolio", async () => {
    const portfolioId = await insertPortfolio("Core");

    await insertTrade({ date: Date.UTC(2026, 2, 8), portfolioId, ticker: "AAPL" });
    await insertTrade({ date: Date.UTC(2026, 2, 7), ticker: "MSFT" });

    const result = await asUser().query(api.trades.listTradesPage, {
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
      withoutPortfolio: true,
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].portfolioId).toBeUndefined();
    expect(result.page[0].ticker).toBe("MSFT");
  });

  it("matches the Kraken default account when the trade has no explicit account id", async () => {
    await insertTrade({
      date: Date.UTC(2026, 2, 8),
      source: "kraken",
      ticker: "BTCUSD",
    });
    await insertTrade({
      brokerageAccountId: "spot-wallet-2",
      date: Date.UTC(2026, 2, 7),
      source: "kraken",
      ticker: "ETHUSD",
    });

    const result = await asUser().query(api.trades.listTradesPage, {
      accountId: KRAKEN_DEFAULT_ACCOUNT_ID,
      accountSource: "kraken",
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].ticker).toBe("BTCUSD");
    expect(result.page[0].brokerageAccountId).toBeUndefined();
  });
});
