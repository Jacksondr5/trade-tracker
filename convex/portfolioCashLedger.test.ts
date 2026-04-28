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

const DEFAULT_DATE = Date.UTC(2026, 0, 15, 14, 0);

describe("portfolio cash ledger", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  function asUser(ownerId: string) {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  async function insertPortfolio(args: {
    name: string;
    ownerId: string;
  }): Promise<Id<"portfolios">> {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("portfolios", {
        name: args.name,
        ownerId: args.ownerId,
      });
    });
  }

  describe("createPortfolioCashLedgerEntry", () => {
    it("records a deposit with positive amount and a note", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 10_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          note: "Initial capital",
          portfolioId,
        },
      );

      const entries = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        _id: entryId,
        amount: 10_000,
        date: DEFAULT_DATE,
        entryType: "deposit",
        note: "Initial capital",
        ownerId: ownerA,
        portfolioId,
      });
    });

    it("supports a withdrawal as a negative amount", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: -2_500,
          date: DEFAULT_DATE,
          entryType: "withdrawal",
          portfolioId,
        },
      );

      const entries = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries).toHaveLength(1);
      expect(entries[0]?.amount).toBe(-2_500);
      expect(entries[0]?.entryType).toBe("withdrawal");
    });

    it("rejects a negative deposit amount", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.createPortfolioCashLedgerEntry,
          {
            amount: -500,
            date: DEFAULT_DATE,
            entryType: "deposit",
            portfolioId,
          },
        ),
      ).rejects.toThrow("Deposits must use a positive amount");
    });

    it("rejects a positive withdrawal amount", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.createPortfolioCashLedgerEntry,
          {
            amount: 500,
            date: DEFAULT_DATE,
            entryType: "withdrawal",
            portfolioId,
          },
        ),
      ).rejects.toThrow("Withdrawals must use a negative amount");
    });

    it("rejects non-finite amounts", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.createPortfolioCashLedgerEntry,
          {
            amount: Number.NaN,
            date: DEFAULT_DATE,
            entryType: "deposit",
            portfolioId,
          },
        ),
      ).rejects.toThrow("Amount must be a finite number");
    });

    it("rejects a zero amount", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.createPortfolioCashLedgerEntry,
          {
            amount: 0,
            date: DEFAULT_DATE,
            entryType: "deposit",
            portfolioId,
          },
        ),
      ).rejects.toThrow("Amount must be non-zero");
    });

    it("rejects entries on portfolios owned by other users", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await expect(
        asUser(ownerB).mutation(
          api.portfolioCashLedger.createPortfolioCashLedgerEntry,
          {
            amount: 1_000,
            date: DEFAULT_DATE,
            entryType: "deposit",
            portfolioId,
          },
        ),
      ).rejects.toThrow("Portfolio not found");
    });

    it("supports an initial deposit on a previously empty portfolio", async () => {
      const portfolioId = await insertPortfolio({
        name: "Fresh",
        ownerId: ownerA,
      });

      const before = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );
      expect(before).toEqual([]);

      await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 5_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      const after = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );
      expect(after).toHaveLength(1);
      expect(after[0]?.amount).toBe(5_000);
    });
  });

  describe("listPortfolioCashLedgerEntries", () => {
    it("returns entries ordered by date descending", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const olderDate = Date.UTC(2026, 0, 5, 14, 0);
      const middleDate = Date.UTC(2026, 0, 10, 14, 0);
      const newerDate = Date.UTC(2026, 0, 15, 14, 0);

      const olderId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: olderDate,
          entryType: "deposit",
          portfolioId,
        },
      );
      const newerId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 2_000,
          date: newerDate,
          entryType: "deposit",
          portfolioId,
        },
      );
      const middleId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_500,
          date: middleDate,
          entryType: "deposit",
          portfolioId,
        },
      );

      const entries = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries.map((entry) => entry._id)).toEqual([
        newerId,
        middleId,
        olderId,
      ]);
    });

    it("returns an empty list when the portfolio belongs to another owner", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      const entries = await asUser(ownerB).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries).toEqual([]);
    });

    it("only returns entries from the requested portfolio", async () => {
      const portfolioOne = await insertPortfolio({
        name: "One",
        ownerId: ownerA,
      });
      const portfolioTwo = await insertPortfolio({
        name: "Two",
        ownerId: ownerA,
      });

      await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 100,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId: portfolioOne,
        },
      );
      await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 200,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId: portfolioTwo,
        },
      );

      const entriesOne = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId: portfolioOne },
      );
      const entriesTwo = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId: portfolioTwo },
      );

      expect(entriesOne).toHaveLength(1);
      expect(entriesOne[0]?.amount).toBe(100);
      expect(entriesTwo).toHaveLength(1);
      expect(entriesTwo[0]?.amount).toBe(200);
    });
  });

  describe("updatePortfolioCashLedgerEntry", () => {
    it("updates amount, date, entry type, and note for the owner", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          note: "First",
          portfolioId,
        },
      );

      const updatedDate = Date.UTC(2026, 1, 1, 14, 0);
      await asUser(ownerA).mutation(
        api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
        {
          amount: -200,
          date: updatedDate,
          entryId,
          entryType: "correction",
          note: "Adjusted",
        },
      );

      const entries = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries[0]).toMatchObject({
        _id: entryId,
        amount: -200,
        date: updatedDate,
        entryType: "correction",
        note: "Adjusted",
      });
    });

    it("rejects updates from a non-owner", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      await expect(
        asUser(ownerB).mutation(
          api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
          {
            amount: 5_000,
            entryId,
          },
        ),
      ).rejects.toThrow("Cash ledger entry not found");
    });

    it("rejects an updated zero amount", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
          { amount: 0, entryId },
        ),
      ).rejects.toThrow("Amount must be non-zero");
    });

    it("clears a note when an empty string is provided", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          note: "First",
          portfolioId,
        },
      );

      await asUser(ownerA).mutation(
        api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
        { entryId, note: "   " },
      );

      const entries = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries[0]?.note).toBeUndefined();
    });

    it("rejects changing only entry type when resulting sign is invalid", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
          { entryId, entryType: "withdrawal" },
        ),
      ).rejects.toThrow("Withdrawals must use a negative amount");
    });

    it("rejects changing only amount when resulting sign is invalid", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: -1_000,
          date: DEFAULT_DATE,
          entryType: "withdrawal",
          portfolioId,
        },
      );

      await expect(
        asUser(ownerA).mutation(
          api.portfolioCashLedger.updatePortfolioCashLedgerEntry,
          { amount: 100, entryId },
        ),
      ).rejects.toThrow("Withdrawals must use a negative amount");
    });
  });

  describe("deletePortfolioCashLedgerEntry", () => {
    it("removes an entry for the owner", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      await asUser(ownerA).mutation(
        api.portfolioCashLedger.deletePortfolioCashLedgerEntry,
        { entryId },
      );

      const entries = await asUser(ownerA).query(
        api.portfolioCashLedger.listPortfolioCashLedgerEntries,
        { portfolioId },
      );

      expect(entries).toEqual([]);
    });

    it("rejects deletes from a non-owner", async () => {
      const portfolioId = await insertPortfolio({
        name: "Main",
        ownerId: ownerA,
      });

      const entryId = await asUser(ownerA).mutation(
        api.portfolioCashLedger.createPortfolioCashLedgerEntry,
        {
          amount: 1_000,
          date: DEFAULT_DATE,
          entryType: "deposit",
          portfolioId,
        },
      );

      await expect(
        asUser(ownerB).mutation(
          api.portfolioCashLedger.deletePortfolioCashLedgerEntry,
          { entryId },
        ),
      ).rejects.toThrow("Cash ledger entry not found");
    });
  });
});
