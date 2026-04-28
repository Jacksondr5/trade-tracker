import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertOwner, requireUser } from "./lib/auth";

const entryTypeValidator = v.union(
  v.literal("deposit"),
  v.literal("withdrawal"),
  v.literal("correction"),
);

const cashLedgerEntryValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("portfolioCashLedgerEntries"),
  amount: v.number(),
  createdAt: v.number(),
  date: v.number(),
  entryType: entryTypeValidator,
  note: v.optional(v.string()),
  ownerId: v.string(),
  portfolioId: v.id("portfolios"),
  updatedAt: v.number(),
});

const MAX_NOTE_LENGTH = 500;

function validateAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new ConvexError("Amount must be a finite number");
  }
  if (amount === 0) {
    throw new ConvexError("Amount must be non-zero");
  }
  return amount;
}

function validateEntryAmount(
  amount: number,
  entryType: "deposit" | "withdrawal" | "correction",
): number {
  const normalizedAmount = validateAmount(amount);

  if (entryType === "deposit" && normalizedAmount < 0) {
    throw new ConvexError("Deposits must use a positive amount");
  }
  if (entryType === "withdrawal" && normalizedAmount > 0) {
    throw new ConvexError("Withdrawals must use a negative amount");
  }

  return normalizedAmount;
}

function validateDate(date: number): number {
  if (!Number.isFinite(date)) {
    throw new ConvexError("Date is required");
  }
  return date;
}

function normalizeNote(note: string | undefined): string | undefined {
  if (note === undefined) {
    return undefined;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new ConvexError(
      `Note must be ${MAX_NOTE_LENGTH} characters or fewer`,
    );
  }
  return trimmed;
}

export const listPortfolioCashLedgerEntries = query({
  args: {
    portfolioId: v.id("portfolios"),
  },
  returns: v.array(cashLedgerEntryValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    if (!portfolio || portfolio.ownerId !== ownerId) {
      return [];
    }

    const entries = await ctx.db
      .query("portfolioCashLedgerEntries")
      .withIndex("by_ownerId_and_portfolioId_and_date", (q) =>
        q.eq("ownerId", ownerId).eq("portfolioId", args.portfolioId),
      )
      .order("desc")
      .collect();

    return entries;
  },
});

export const createPortfolioCashLedgerEntry = mutation({
  args: {
    amount: v.number(),
    date: v.number(),
    entryType: entryTypeValidator,
    note: v.optional(v.string()),
    portfolioId: v.id("portfolios"),
  },
  returns: v.id("portfolioCashLedgerEntries"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const portfolio = await ctx.db.get(args.portfolioId);
    assertOwner(portfolio, ownerId, "Portfolio not found");

    const amount = validateEntryAmount(args.amount, args.entryType);
    const date = validateDate(args.date);
    const note = normalizeNote(args.note);
    const now = Date.now();

    return await ctx.db.insert("portfolioCashLedgerEntries", {
      amount,
      createdAt: now,
      date,
      entryType: args.entryType,
      note,
      ownerId,
      portfolioId: args.portfolioId,
      updatedAt: now,
    });
  },
});

export const updatePortfolioCashLedgerEntry = mutation({
  args: {
    amount: v.optional(v.number()),
    date: v.optional(v.number()),
    entryId: v.id("portfolioCashLedgerEntries"),
    entryType: v.optional(entryTypeValidator),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const existing = await ctx.db.get(args.entryId);
    const entry = assertOwner(existing, ownerId, "Cash ledger entry not found");

    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    const nextEntryType = args.entryType ?? entry.entryType;
    const nextAmount = args.amount ?? entry.amount;

    if (args.amount !== undefined || args.entryType !== undefined) {
      patch.amount = validateEntryAmount(nextAmount, nextEntryType);
    }
    if (args.date !== undefined) {
      patch.date = validateDate(args.date);
    }
    if (args.entryType !== undefined) {
      patch.entryType = args.entryType;
    }
    if (args.note !== undefined) {
      patch.note = normalizeNote(args.note);
    }

    await ctx.db.patch(args.entryId, patch);
    return null;
  },
});

export const deletePortfolioCashLedgerEntry = mutation({
  args: {
    entryId: v.id("portfolioCashLedgerEntries"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const entry = await ctx.db.get(args.entryId);
    assertOwner(entry, ownerId, "Cash ledger entry not found");

    await ctx.db.delete(args.entryId);
    return null;
  },
});
