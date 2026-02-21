# Trade Import CSV MVP — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CSV import for IBKR and Kraken trades with an inbox review flow before trades enter the main system.

**Architecture:** Imported trades land in the existing `trades` table with `inboxStatus: "pending_review"`. Client-side Papa Parse handles CSV parsing and normalization. All existing trade queries filter out pending trades so imports don't affect P&L until accepted.

**Tech Stack:** Convex (backend), Next.js App Router (frontend), Papa Parse (CSV parsing), TanStack Form + Zod (existing form patterns), Tailwind CSS (styling)

**Design doc:** `docs/plans/2026-02-20-trade-import-csv-mvp.md`

---

## Critical Context

### Files that query trades (ALL need inbox filtering)

Every file that queries the `trades` table must filter out `pending_review` trades. The filter is: `t.inboxStatus !== "pending_review"` (this includes both `undefined` for existing/manual trades AND `"accepted"` for reviewed imports).

- `convex/trades.ts` — `listTrades`, `getTrade`, `getTradesByTradePlan`
- `convex/tradePlans.ts` — `getTradesByTradePlan`, `getTradePlanPL`
- `convex/campaigns.ts` — `getCampaignPL`, `getCampaignPositionStatus`
- `convex/analytics.ts` — `getDashboardStats`
- `convex/positions.ts` — `getPositions`

### Return validators must include new fields

Both `convex/trades.ts` and `convex/tradePlans.ts` define `tradeWithPLValidator`. When queries spread trade documents (`{ ...trade, realizedPL }`), the returned objects will include new schema fields. Convex runtime validation rejects extra fields, so the validators **must** be updated with the new optional fields.

### IBKR CSV row types

The sample CSV at `data/ibkr.csv` contains three row types:
1. **Summary rows** — empty `Open/CloseIndicator`, no `DateTime` → **skip**
2. **Order rows** — non-empty `Open/CloseIndicator`, non-empty `DateTime`, empty `TransactionType` → **parse these**
3. **Fill rows** — `TransactionType` = "ExchTrade" → **skip**
4. **Repeated header rows** — `ClientAccountID` = "ClientAccountID" (line 143 in sample) → **skip**

### Kraken CSV filtering

Filter to `aclass === "equity_pair"` only. The USDC/USD row has `aclass: "forex"` — skip it. Group remaining rows by `ordertxid` and aggregate fills into single orders.

---

## Task 1: Schema Changes

**Files:**
- Modify: `convex/schema.ts:63-78`

### Step 1: Add new fields and indexes to trades table

In `convex/schema.ts`, replace the trades table definition (lines 63–78) with:

```typescript
  trades: defineTable({
    assetType: v.union(v.literal("crypto"), v.literal("stock")),
    brokerageAccountId: v.optional(v.string()),
    date: v.number(),
    direction: v.union(v.literal("long"), v.literal("short")),
    externalId: v.optional(v.string()),
    fees: v.optional(v.number()),
    inboxStatus: v.optional(
      v.union(v.literal("pending_review"), v.literal("accepted")),
    ),
    notes: v.optional(v.string()),
    orderType: v.optional(v.string()),
    ownerId: v.string(),
    price: v.number(),
    quantity: v.number(),
    side: v.union(v.literal("buy"), v.literal("sell")),
    source: v.optional(
      v.union(v.literal("manual"), v.literal("ibkr"), v.literal("kraken")),
    ),
    taxes: v.optional(v.number()),
    ticker: v.string(),
    tradePlanId: v.optional(v.id("tradePlans")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_date", ["ownerId", "date"])
    .index("by_owner_externalId", ["ownerId", "externalId"])
    .index("by_owner_inboxStatus", ["ownerId", "inboxStatus"])
    .index("by_owner_ticker", ["ownerId", "ticker"])
    .index("by_owner_tradePlanId", ["ownerId", "tradePlanId"]),
```

### Step 2: Run typecheck

Run: `pnpm typecheck`
Expected: PASS (schema changes are self-contained)

### Step 3: Commit

```bash
git add convex/schema.ts
git commit -m "feat: add import fields and indexes to trades schema"
```

---

## Task 2: Update Trade Validators and Queries

**Files:**
- Modify: `convex/trades.ts`
- Modify: `convex/tradePlans.ts`
- Modify: `convex/campaigns.ts`
- Modify: `convex/analytics.ts`
- Modify: `convex/positions.ts`

### Step 1: Update tradeWithPLValidator and queries in convex/trades.ts

Replace the `tradeWithPLValidator` (lines 6–20) with:

```typescript
const tradeWithPLValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  brokerageAccountId: v.optional(v.string()),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  inboxStatus: v.optional(
    v.union(v.literal("pending_review"), v.literal("accepted")),
  ),
  notes: v.optional(v.string()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  price: v.number(),
  quantity: v.number(),
  realizedPL: v.union(v.number(), v.null()),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.optional(
    v.union(v.literal("manual"), v.literal("ibkr"), v.literal("kraken")),
  ),
  taxes: v.optional(v.number()),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});
```

In `createTrade` handler, add `source: "manual"` to the insert call. Replace the `return await ctx.db.insert(...)` block (lines 43–54) with:

```typescript
    return await ctx.db.insert("trades", {
      assetType: args.assetType,
      date: args.date,
      direction: args.direction,
      notes: args.notes,
      ownerId,
      price: args.price,
      quantity: args.quantity,
      side: args.side,
      source: "manual",
      ticker: args.ticker,
      tradePlanId: args.tradePlanId,
    });
```

In `listTrades` handler, add inbox filtering. Replace lines 123–126 with:

```typescript
    const trades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
```

And replace `calculateTradesPL(trades)` argument and return sort/map (lines 127–134) with:

```typescript
    const plMap = calculateTradesPL(trades);

    return [...trades]
      .sort((a, b) => b.date - a.date)
      .map((trade) => ({
        ...trade,
        realizedPL: plMap.get(trade._id) ?? null,
      }));
```

In `getTrade` handler, add inbox check. Replace lines 146–148 with:

```typescript
    if (!trade || trade.ownerId !== ownerId || trade.inboxStatus === "pending_review") {
      return null;
    }
```

And filter allTrades. Replace lines 150–154 with:

```typescript
    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
    const plMap = calculateTradesPL(allTrades);
```

In `getTradesByTradePlan` handler, add inbox filtering. Replace lines 173–184 with:

```typescript
    const trades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner_tradePlanId", (q) =>
          q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
        )
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");

    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
    const plMap = calculateTradesPL(allTrades);
```

### Step 2: Update tradeWithPLValidator and queries in convex/tradePlans.ts

Replace the `tradeWithPLValidator` at lines 331–345 with the same validator (add new optional fields):

```typescript
const tradeWithPLValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  brokerageAccountId: v.optional(v.string()),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  inboxStatus: v.optional(
    v.union(v.literal("pending_review"), v.literal("accepted")),
  ),
  notes: v.optional(v.string()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  price: v.number(),
  quantity: v.number(),
  realizedPL: v.union(v.number(), v.null()),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.optional(
    v.union(v.literal("manual"), v.literal("ibkr"), v.literal("kraken")),
  ),
  taxes: v.optional(v.number()),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});
```

In `getTradesByTradePlan` (the one in tradePlans.ts, lines 347–377), add inbox filtering. Replace the two `.collect()` calls with filtered versions:

```typescript
    const trades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner_tradePlanId", (q) =>
          q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
        )
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");

    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
    const plMap = calculateTradesPL(allTrades);
```

In `getTradePlanPL` (lines 379–430), add the same inbox filtering to both queries:

```typescript
    const trades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner_tradePlanId", (q) =>
          q.eq("ownerId", ownerId).eq("tradePlanId", args.tradePlanId),
        )
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");

    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
    const plMap = calculateTradesPL(allTrades);
```

### Step 3: Add inbox filtering to convex/campaigns.ts

In `getCampaignPL` handler, replace lines 165–168 with:

```typescript
    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
```

In `getCampaignPositionStatus` handler, replace lines 231–234 with:

```typescript
    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
```

### Step 4: Add inbox filtering to convex/analytics.ts

In `getDashboardStats` handler, replace lines 23–26 with:

```typescript
    const allTrades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
```

### Step 5: Add inbox filtering to convex/positions.ts

In `getPositions` handler, replace lines 28–31 with:

```typescript
    const trades = (
      await ctx.db
        .query("trades")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
        .collect()
    ).filter((t) => t.inboxStatus !== "pending_review");
```

### Step 6: Run typecheck

Run: `pnpm typecheck`
Expected: PASS

### Step 7: Commit

```bash
git add convex/trades.ts convex/tradePlans.ts convex/campaigns.ts convex/analytics.ts convex/positions.ts
git commit -m "feat: add import fields to validators and inbox filtering to all trade queries"
```

---

## Task 3: Import Convex Functions

**Files:**
- Create: `convex/imports.ts`

### Step 1: Create convex/imports.ts

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertOwner, requireUser } from "./lib/auth";

const sourceValidator = v.union(
  v.literal("manual"),
  v.literal("ibkr"),
  v.literal("kraken"),
);

const inboxTradeValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("trades"),
  assetType: v.union(v.literal("crypto"), v.literal("stock")),
  brokerageAccountId: v.optional(v.string()),
  date: v.number(),
  direction: v.union(v.literal("long"), v.literal("short")),
  externalId: v.optional(v.string()),
  fees: v.optional(v.number()),
  inboxStatus: v.optional(
    v.union(v.literal("pending_review"), v.literal("accepted")),
  ),
  notes: v.optional(v.string()),
  orderType: v.optional(v.string()),
  ownerId: v.string(),
  price: v.number(),
  quantity: v.number(),
  side: v.union(v.literal("buy"), v.literal("sell")),
  source: v.optional(sourceValidator),
  taxes: v.optional(v.number()),
  ticker: v.string(),
  tradePlanId: v.optional(v.id("tradePlans")),
});

export const importTrades = mutation({
  args: {
    trades: v.array(
      v.object({
        assetType: v.union(v.literal("stock"), v.literal("crypto")),
        brokerageAccountId: v.optional(v.string()),
        date: v.number(),
        direction: v.union(v.literal("long"), v.literal("short")),
        externalId: v.string(),
        fees: v.optional(v.number()),
        notes: v.optional(v.string()),
        orderType: v.optional(v.string()),
        price: v.number(),
        quantity: v.number(),
        side: v.union(v.literal("buy"), v.literal("sell")),
        source: v.union(v.literal("ibkr"), v.literal("kraken")),
        taxes: v.optional(v.number()),
        ticker: v.string(),
      }),
    ),
  },
  returns: v.object({
    imported: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    // Build set of existing externalIds for dedup
    const existingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const existingExternalIds = new Set(
      existingTrades
        .filter((t) => t.externalId !== undefined)
        .map((t) => t.externalId!),
    );

    let imported = 0;
    let skipped = 0;

    for (const trade of args.trades) {
      if (existingExternalIds.has(trade.externalId)) {
        skipped++;
        continue;
      }

      await ctx.db.insert("trades", {
        assetType: trade.assetType,
        brokerageAccountId: trade.brokerageAccountId,
        date: trade.date,
        direction: trade.direction,
        externalId: trade.externalId,
        fees: trade.fees,
        inboxStatus: "pending_review",
        notes: trade.notes,
        orderType: trade.orderType,
        ownerId,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        source: trade.source,
        taxes: trade.taxes,
        ticker: trade.ticker,
      });

      // Track the new externalId so duplicates within the same batch are skipped
      existingExternalIds.add(trade.externalId);
      imported++;
    }

    return { imported, skipped };
  },
});

export const listInboxTrades = query({
  args: {},
  returns: v.array(inboxTradeValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_owner_inboxStatus", (q) =>
        q.eq("ownerId", ownerId).eq("inboxStatus", "pending_review"),
      )
      .collect();
    return trades.sort((a, b) => b.date - a.date);
  },
});

export const acceptTrade = mutation({
  args: { tradeId: v.id("trades") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const trade = await ctx.db.get(args.tradeId);
    assertOwner(trade, ownerId, "Trade not found");
    if (trade.inboxStatus !== "pending_review") {
      throw new Error("Trade is not pending review");
    }
    await ctx.db.patch(args.tradeId, { inboxStatus: "accepted" });
    return null;
  },
});

export const acceptAllTrades = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const pendingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner_inboxStatus", (q) =>
        q.eq("ownerId", ownerId).eq("inboxStatus", "pending_review"),
      )
      .collect();
    for (const trade of pendingTrades) {
      await ctx.db.patch(trade._id, { inboxStatus: "accepted" });
    }
    return pendingTrades.length;
  },
});

export const deleteInboxTrade = mutation({
  args: { tradeId: v.id("trades") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const trade = await ctx.db.get(args.tradeId);
    assertOwner(trade, ownerId, "Trade not found");
    if (trade.inboxStatus !== "pending_review") {
      throw new Error("Can only delete pending review trades from inbox");
    }
    await ctx.db.delete(args.tradeId);
    return null;
  },
});

export const deleteAllInboxTrades = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const pendingTrades = await ctx.db
      .query("trades")
      .withIndex("by_owner_inboxStatus", (q) =>
        q.eq("ownerId", ownerId).eq("inboxStatus", "pending_review"),
      )
      .collect();
    for (const trade of pendingTrades) {
      await ctx.db.delete(trade._id);
    }
    return pendingTrades.length;
  },
});

export const updateInboxTrade = mutation({
  args: {
    assetType: v.optional(v.union(v.literal("stock"), v.literal("crypto"))),
    direction: v.optional(v.union(v.literal("long"), v.literal("short"))),
    notes: v.optional(v.string()),
    tradePlanId: v.optional(v.id("tradePlans")),
    tradeId: v.id("trades"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const { tradeId, ...updates } = args;
    const trade = await ctx.db.get(tradeId);
    assertOwner(trade, ownerId, "Trade not found");
    if (trade.inboxStatus !== "pending_review") {
      throw new Error("Can only edit pending review trades");
    }

    if (updates.tradePlanId !== undefined) {
      const tradePlan = await ctx.db.get(updates.tradePlanId);
      assertOwner(tradePlan, ownerId, "Trade plan not found");
    }

    const patch: Record<string, unknown> = {};
    if (updates.direction !== undefined) patch.direction = updates.direction;
    if (updates.assetType !== undefined) patch.assetType = updates.assetType;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.tradePlanId !== undefined)
      patch.tradePlanId = updates.tradePlanId;

    await ctx.db.patch(tradeId, patch);
    return null;
  },
});
```

### Step 2: Run typecheck

Run: `pnpm typecheck`
Expected: PASS

### Step 3: Commit

```bash
git add convex/imports.ts
git commit -m "feat: add import mutations and inbox queries"
```

---

## Task 4: Client-Side CSV Parsers

**Files:**
- Create: `src/lib/imports/types.ts`
- Create: `src/lib/imports/ibkr-parser.ts`
- Create: `src/lib/imports/kraken-parser.ts`

### Step 1: Install papaparse

Run: `pnpm add papaparse @types/papaparse`

### Step 2: Create src/lib/imports/types.ts

```typescript
export type BrokerageSource = "ibkr" | "kraken";

export interface NormalizedTrade {
  assetType: "stock" | "crypto";
  brokerageAccountId?: string;
  date: number;
  direction: "long" | "short";
  externalId: string;
  fees?: number;
  orderType?: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  source: BrokerageSource;
  taxes?: number;
  ticker: string;
}

export interface ParseResult {
  errors: string[];
  trades: NormalizedTrade[];
}
```

### Step 3: Create src/lib/imports/ibkr-parser.ts

The IBKR CSV contains summary, order, and fill rows. We only parse **order-level rows** identified by:
- Non-empty `Open/CloseIndicator`
- Non-empty `DateTime`
- Empty `TransactionType` (not "ExchTrade")

The CSV may also contain repeated header rows (for multiple accounts).

```typescript
import Papa from "papaparse";
import type { NormalizedTrade, ParseResult } from "./types";

interface IBKRRow {
  "Buy/Sell": string;
  ClientAccountID: string;
  DateTime: string;
  "Open/CloseIndicator": string;
  OrderType: string;
  Quantity: string;
  Symbol: string;
  Taxes: string;
  TradePrice: string;
  TransactionType: string;
}

function parseIBKRDateTime(dt: string): number {
  const [datePart, timePart] = dt.split(";");
  const year = parseInt(datePart.slice(0, 4));
  const month = parseInt(datePart.slice(4, 6)) - 1;
  const day = parseInt(datePart.slice(6, 8));
  const hour = parseInt(timePart.slice(0, 2));
  const minute = parseInt(timePart.slice(2, 4));
  const second = parseInt(timePart.slice(4, 6));
  return new Date(year, month, day, hour, minute, second).getTime();
}

/**
 * Infer trade direction from Open/Close indicator and Buy/Sell:
 * - O + BUY  = long  (opening a long position)
 * - O + SELL = short (opening a short position)
 * - C + SELL = long  (closing a long position)
 * - C + BUY  = short (closing a short position)
 */
function inferDirection(
  openClose: string,
  buySell: string,
): "long" | "short" {
  const oc = openClose.trim().toUpperCase();
  const bs = buySell.trim().toUpperCase();
  if (oc === "O" && bs === "BUY") return "long";
  if (oc === "O" && bs === "SELL") return "short";
  if (oc === "C" && bs === "SELL") return "long";
  if (oc === "C" && bs === "BUY") return "short";
  return "long";
}

export function parseIBKRCSV(csvContent: string): ParseResult {
  const parsed = Papa.parse<IBKRRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];
  const trades: NormalizedTrade[] = [];

  for (const row of parsed.data) {
    // Skip repeated header rows (multi-account exports)
    if (row.ClientAccountID === "ClientAccountID") continue;

    // Skip summary rows (no Open/CloseIndicator)
    if (!row["Open/CloseIndicator"]?.trim()) continue;

    // Skip fill-level rows (ExchTrade)
    if (row.TransactionType?.trim() === "ExchTrade") continue;

    // Skip rows without DateTime
    if (!row.DateTime?.trim()) continue;

    try {
      const quantity = Math.abs(parseFloat(row.Quantity));
      const price = parseFloat(row.TradePrice);
      const taxes = parseFloat(row.Taxes) || 0;
      const date = parseIBKRDateTime(row.DateTime);
      const buySell = row["Buy/Sell"].trim().toUpperCase();
      const side: "buy" | "sell" = buySell === "BUY" ? "buy" : "sell";
      const direction = inferDirection(
        row["Open/CloseIndicator"],
        row["Buy/Sell"],
      );

      // Composite string for dedup (unique per order)
      const externalId = `${row.ClientAccountID}|${row.Symbol}|${row.DateTime}|${row.TradePrice}|${row.Quantity}`;

      trades.push({
        assetType: "stock",
        brokerageAccountId: row.ClientAccountID,
        date,
        direction,
        externalId,
        fees: 0,
        orderType: row.OrderType?.trim() || undefined,
        price,
        quantity,
        side,
        source: "ibkr",
        taxes: taxes || undefined,
        ticker: row.Symbol.trim().toUpperCase(),
      });
    } catch (e) {
      errors.push(
        `Failed to parse IBKR row for ${row.Symbol}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { errors, trades };
}
```

### Step 4: Create src/lib/imports/kraken-parser.ts

Groups fills by `ordertxid` and aggregates into single order-level trades.

```typescript
import Papa from "papaparse";
import type { NormalizedTrade, ParseResult } from "./types";

interface KrakenRow {
  aclass: string;
  cost: string;
  fee: string;
  ordertxid: string;
  ordertype: string;
  pair: string;
  time: string;
  type: string;
  vol: string;
}

export function parseKrakenCSV(csvContent: string): ParseResult {
  const parsed = Papa.parse<KrakenRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];

  // Group fills by ordertxid
  const orderMap = new Map<string, KrakenRow[]>();

  for (const row of parsed.data) {
    // Filter non-equity rows (e.g., USDC/USD forex)
    if (row.aclass !== "equity_pair") continue;

    const orderId = row.ordertxid?.trim();
    if (!orderId) continue;

    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, []);
    }
    orderMap.get(orderId)!.push(row);
  }

  const trades: NormalizedTrade[] = [];

  for (const [orderId, fills] of orderMap) {
    try {
      let totalCost = 0;
      let totalVol = 0;
      let totalFee = 0;
      let earliestTime = Infinity;
      let pair = "";
      let type = "";
      let ordertype = "";

      for (const fill of fills) {
        const cost = parseFloat(fill.cost);
        const vol = parseFloat(fill.vol);
        const fee = parseFloat(fill.fee);
        const time = new Date(fill.time.replace(" ", "T")).getTime();

        totalCost += cost;
        totalVol += vol;
        totalFee += fee;
        if (time < earliestTime) earliestTime = time;
        pair = fill.pair;
        type = fill.type;
        ordertype = fill.ordertype;
      }

      const avgPrice = totalVol > 0 ? totalCost / totalVol : 0;
      const ticker = pair.split("/")[0].toUpperCase();
      const side: "buy" | "sell" =
        type.trim().toLowerCase() === "buy" ? "buy" : "sell";

      trades.push({
        assetType: "crypto",
        date: earliestTime,
        direction: "long",
        externalId: orderId,
        fees: totalFee || undefined,
        orderType: ordertype?.trim() || undefined,
        price: avgPrice,
        quantity: totalVol,
        side,
        source: "kraken",
        taxes: undefined,
        ticker,
      });
    } catch (e) {
      errors.push(
        `Failed to parse Kraken order ${orderId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { errors, trades };
}
```

### Step 5: Run typecheck

Run: `pnpm typecheck`
Expected: PASS

### Step 6: Commit

```bash
git add package.json pnpm-lock.yaml src/lib/imports/
git commit -m "feat: add CSV parsers for IBKR and Kraken"
```

---

## Task 5: Import Page UI

**Files:**
- Create: `src/app/imports/page.tsx`
- Modify: `src/components/Header.tsx:8-15`

### Step 1: Create src/app/imports/page.tsx

```tsx
"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button, Card } from "~/components/ui";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseIBKRCSV } from "~/lib/imports/ibkr-parser";
import { parseKrakenCSV } from "~/lib/imports/kraken-parser";
import type { BrokerageSource, ParseResult } from "~/lib/imports/types";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export default function ImportsPage() {
  // Upload state
  const [brokerage, setBrokerage] = useState<BrokerageSource>("ibkr");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Edit state
  const [editingTradeId, setEditingTradeId] = useState<Id<"trades"> | null>(
    null,
  );
  const [editDirection, setEditDirection] = useState<"long" | "short">("long");
  const [editAssetType, setEditAssetType] = useState<"stock" | "crypto">(
    "stock",
  );
  const [editNotes, setEditNotes] = useState("");
  const [editTradePlanId, setEditTradePlanId] = useState("");

  // Queries
  const inboxTrades = useQuery(api.imports.listInboxTrades);
  const openTradePlans = useQuery(api.tradePlans.listOpenTradePlans);

  // Mutations
  const importTradesMutation = useMutation(api.imports.importTrades);
  const acceptTrade = useMutation(api.imports.acceptTrade);
  const acceptAllTrades = useMutation(api.imports.acceptAllTrades);
  const deleteInboxTrade = useMutation(api.imports.deleteInboxTrade);
  const deleteAllInboxTrades = useMutation(api.imports.deleteAllInboxTrades);
  const updateInboxTrade = useMutation(api.imports.updateInboxTrade);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result =
        brokerage === "ibkr"
          ? parseIBKRCSV(content)
          : parseKrakenCSV(content);
      setParseResult(result);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.trades.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importTradesMutation({
        trades: parseResult.trades,
      });
      setImportResult(result);
      setParseResult(null);
      // Reset file input
      const fileInput = document.getElementById(
        "csv-file-input",
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import failed",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleEdit = (trade: NonNullable<typeof inboxTrades>[number]) => {
    setEditingTradeId(trade._id);
    setEditDirection(trade.direction);
    setEditAssetType(trade.assetType);
    setEditNotes(trade.notes || "");
    setEditTradePlanId(
      trade.tradePlanId ? (trade.tradePlanId as string) : "",
    );
  };

  const handleSaveEdit = async () => {
    if (!editingTradeId) return;
    try {
      await updateInboxTrade({
        assetType: editAssetType,
        direction: editDirection,
        notes: editNotes || undefined,
        tradePlanId: editTradePlanId
          ? (editTradePlanId as Id<"tradePlans">)
          : undefined,
        tradeId: editingTradeId,
      });
      setEditingTradeId(null);
    } catch (error) {
      console.error("Failed to update trade:", error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-slate-12 mb-6 text-2xl font-bold">
        Import Trades
      </h1>

      {/* Upload Section */}
      <Card className="mb-8 bg-slate-800 p-6">
        <h2 className="text-slate-12 mb-4 text-lg font-semibold">
          Upload CSV
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="brokerage-select"
                className="text-slate-12 mb-1 block text-sm font-medium"
              >
                Brokerage
              </label>
              <select
                id="brokerage-select"
                value={brokerage}
                onChange={(e) => {
                  setBrokerage(e.target.value as BrokerageSource);
                  setParseResult(null);
                  setImportResult(null);
                }}
                className="text-slate-12 h-9 rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="ibkr">Interactive Brokers (IBKR)</option>
                <option value="kraken">Kraken</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="csv-file-input"
                className="text-slate-12 mb-1 block text-sm font-medium"
              >
                CSV File
              </label>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="text-slate-12 text-sm file:mr-4 file:rounded-md file:border file:border-slate-600 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:text-slate-300 file:hover:bg-slate-600"
              />
            </div>
          </div>

          {/* Parse Preview */}
          {parseResult && (
            <div className="rounded-md border border-slate-600 bg-slate-700 p-4">
              <p className="text-slate-12 text-sm">
                Parsed{" "}
                <span className="font-semibold">
                  {parseResult.trades.length}
                </span>{" "}
                trade{parseResult.trades.length !== 1 ? "s" : ""} from{" "}
                {brokerage.toUpperCase()} CSV.
              </p>
              {parseResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-yellow-400">
                    {parseResult.errors.length} row(s) had errors:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-yellow-300">
                    {parseResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {parseResult.errors.length > 5 && (
                      <li>
                        ...and {parseResult.errors.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
              <div className="mt-3">
                <Button
                  onClick={() => void handleImport()}
                  disabled={
                    isImporting || parseResult.trades.length === 0
                  }
                >
                  {isImporting
                    ? "Importing..."
                    : `Import ${parseResult.trades.length} Trade${parseResult.trades.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="text-slate-12 rounded-md bg-green-900/50 p-4 text-sm">
              Imported{" "}
              <span className="font-semibold">{importResult.imported}</span>{" "}
              trade{importResult.imported !== 1 ? "s" : ""}.
              {importResult.skipped > 0 && (
                <>
                  {" "}
                  Skipped{" "}
                  <span className="font-semibold">
                    {importResult.skipped}
                  </span>{" "}
                  duplicate{importResult.skipped !== 1 ? "s" : ""}.
                </>
              )}
            </div>
          )}

          {importError && (
            <div className="rounded-md bg-red-900/50 p-4 text-sm text-red-300">
              {importError}
            </div>
          )}
        </div>
      </Card>

      {/* Inbox Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-slate-12 text-lg font-semibold">
            Inbox
            {inboxTrades && inboxTrades.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">
                ({inboxTrades.length} pending)
              </span>
            )}
          </h2>
          {inboxTrades && inboxTrades.length > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={() => void acceptAllTrades()}
                variant="outline"
              >
                Accept All ({inboxTrades.length})
              </Button>
              <Button
                onClick={() => void deleteAllInboxTrades()}
                variant="outline"
              >
                Delete All
              </Button>
            </div>
          )}
        </div>

        {/* Edit Form */}
        {editingTradeId && (
          <Card className="mb-4 bg-slate-800 p-4">
            <h3 className="text-slate-12 mb-3 text-sm font-semibold">
              Edit Trade
            </h3>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Direction
                </label>
                <select
                  value={editDirection}
                  onChange={(e) =>
                    setEditDirection(
                      e.target.value as "long" | "short",
                    )
                  }
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Asset Type
                </label>
                <select
                  value={editAssetType}
                  onChange={(e) =>
                    setEditAssetType(
                      e.target.value as "stock" | "crypto",
                    )
                  }
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="stock">Stock</option>
                  <option value="crypto">Crypto</option>
                </select>
              </div>
              <div>
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Trade Plan
                </label>
                <select
                  value={editTradePlanId}
                  onChange={(e) => setEditTradePlanId(e.target.value)}
                  className="text-slate-12 h-8 rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                >
                  <option value="">None</option>
                  {openTradePlans?.map((plan) => (
                    <option key={plan._id} value={plan._id}>
                      {plan.name} ({plan.instrumentSymbol})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-slate-12 mb-1 block text-xs font-medium">
                  Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Optional notes..."
                  className="text-slate-12 h-8 w-full rounded border border-slate-600 bg-slate-700 px-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void handleSaveEdit()}>
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingTradeId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Inbox Table */}
        {inboxTrades === undefined ? (
          <div className="text-slate-11">Loading...</div>
        ) : inboxTrades.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-800 p-8 text-center">
            <p className="text-slate-11">
              No trades pending review. Upload a CSV to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full table-auto">
              <thead className="bg-slate-800">
                <tr>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Date
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Ticker
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Side
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Direction
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Price
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Qty
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Type
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Source
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-left text-sm font-medium">
                    Account
                  </th>
                  <th className="text-slate-11 px-4 py-3 text-right text-sm font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700 bg-slate-900">
                {inboxTrades.map((trade) => (
                  <tr
                    key={trade._id}
                    className={`hover:bg-slate-800/50 ${editingTradeId === trade._id ? "bg-slate-800/30" : ""}`}
                  >
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm">
                      {formatDate(trade.date)}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-sm font-medium">
                      {trade.ticker}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={`text-slate-12 rounded px-2 py-0.5 ${
                          trade.side === "buy"
                            ? "border border-green-700 bg-green-900/50"
                            : "border border-red-700 bg-red-900/50"
                        }`}
                      >
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.direction}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {formatCurrency(trade.price)}
                    </td>
                    <td className="text-slate-12 whitespace-nowrap px-4 py-3 text-right text-sm">
                      {trade.quantity}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.assetType}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.source?.toUpperCase() ?? "—"}
                    </td>
                    <td className="text-slate-11 whitespace-nowrap px-4 py-3 text-sm">
                      {trade.brokerageAccountId || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() =>
                            void acceptTrade({
                              tradeId: trade._id,
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-900/50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleEdit(trade)}
                          className="rounded px-2 py-1 text-xs text-blue-400 hover:bg-blue-900/50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            void deleteInboxTrade({
                              tradeId: trade._id,
                            })
                          }
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Add Import link to header navigation

In `src/components/Header.tsx`, add the Import link to the `navLinks` array (line 8–15). Insert after the Portfolio link:

```typescript
const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/trade-plans", label: "Trade Plans" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/positions", label: "Positions" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/imports", label: "Import" },
];
```

### Step 3: Run typecheck, lint, and build

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: ALL PASS

### Step 4: Commit

```bash
git add src/app/imports/page.tsx src/components/Header.tsx
git commit -m "feat: add import page with upload and inbox review UI"
```

---

## Task 6: Verification and Polish

### Step 1: Full build verification

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: ALL PASS

### Step 2: Manual testing checklist

Test in the browser with `pnpm dev` and `npx convex dev` running:

1. **IBKR import**: Upload `data/ibkr.csv` → should show ~65 parsed trades (order rows only) → click Import → trades appear in inbox
2. **Kraken import**: Upload `data/kraken.csv` → should show ~7 parsed trades (aggregated by ordertxid) → click Import → trades appear in inbox
3. **Inbox review**: Accept a trade → disappears from inbox, appears in Trades page. Delete a trade → disappears from inbox, does not appear in Trades page.
4. **Edit**: Click Edit on a trade → change direction to "short" → Save → verify direction updated in inbox
5. **Bulk accept**: Click "Accept All" → all inbox trades move to main trades list
6. **Dedup**: Re-upload same CSV → should show "Skipped N duplicates"
7. **Existing trades**: Navigate to Trades, Positions, Dashboard → verify existing manual trades still work, P&L is correct
8. **New manual trade**: Create a manual trade via /trades/new → verify it works and has no inbox status

### Step 3: Final commit

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: polish trade import flow"
```

---

## Quick Reference: Key Decisions

| Decision | Rationale |
|---|---|
| Filter pattern: `t.inboxStatus !== "pending_review"` | Includes both `undefined` (manual/existing) and `"accepted"` (reviewed imports) |
| Client-side CSV parsing | Avoids sending raw CSV to Convex, keeps mutations clean |
| Order-level rows only (IBKR) | Parser filters to rows with `Open/CloseIndicator` set and `TransactionType` empty |
| Composite string for IBKR externalId | More debuggable than a hash; `AccountID\|Symbol\|DateTime\|Price\|Qty` |
| Dedup via in-memory Set | One DB query for all existing trades, then O(1) lookup per import row |
| No separate staging table | Simpler schema; `inboxStatus` field on trades table handles the workflow |
