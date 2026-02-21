# Trade Import System — CSV MVP

## Context

Trades are currently managed manually in the app. We want to move to a system where trades are imported from external brokerages. The long-term vision is API connections, but the MVP uses CSV file uploads. This plan covers:
- A normalized trade schema that works across brokerages (IBKR and Kraken)
- Client-side CSV parsing and normalization
- An inbox review flow where users accept/edit/delete imported trades
- Deduplication to handle overlapping imports

## Design Decisions

- **Single trades table with inbox status** — imported trades land in the existing `trades` table with `inboxStatus: "pending_review"`. No separate staging table.
- **Client-side CSV parsing** — CSV files are parsed in the browser using Papa Parse. Normalized trade objects are sent to Convex mutations.
- **Order-level granularity** — IBKR CSV will be pre-filtered by the user to only include order-level rows (no summary/fill rows). Kraken fills are aggregated by `ordertxid`.
- **Direction inference** — IBKR: inferred from `Open/CloseIndicator` + `Buy/Sell`. Kraken: defaults to "long", editable in inbox.
- **Auto-skip duplicates** — dedup by `externalId` + `source` + `ownerId`. Silently skip, show count.
- **Reject = delete** — no rejected status. Unwanted trades are deleted.
- **No importJobs table for MVP** — just trades table changes.

## Gaps / Future Work

- **Kraken account ID**: Kraken CSV doesn't include account ID. Need a way for user to input and save this. Deferred to later plan.
- **IBKR CSV format**: User will adjust export to only include order-level rows. We need to collaborate on the exact export format to ensure parser alignment.
- **IBKR fees mapping**: The `Taxes` column in IBKR exports shows 0 for all sample rows. Need to verify where fees actually appear in real exports.

## Normalized Trade Schema

Existing `trades` table fields (unchanged):
- `ticker`: string — asset symbol, uppercase
- `assetType`: "stock" | "crypto"
- `side`: "buy" | "sell"
- `direction`: "long" | "short"
- `price`: number — execution price per unit
- `quantity`: number — always positive
- `date`: number — execution timestamp (ms)
- `notes`: string? — optional
- `ownerId`: string — Clerk user ID
- `tradePlanId`: Id<"tradePlans">? — optional link

New fields for import:
- `fees`: number? — trading fees
- `taxes`: number? — taxes paid
- `orderType`: string? — "MKT", "LMT", "STP", etc.
- `source`: "manual" | "ibkr" | "kraken" — defaults to "manual"
- `externalId`: string? — dedup key (Kraken ordertxid or IBKR composite hash)
- `brokerageAccountId`: string? — e.g., "U18731407"
- `inboxStatus`: "pending_review" | "accepted" | undefined — undefined = manual trade (accepted)

New indexes:
- `by_owner_inboxStatus` — query pending review trades
- `by_owner_externalId` — dedup lookups

## CSV Parsing

### IBKR Parser
Assumes every row is an order-level trade (user pre-filters export).

Field mapping:
- `ticker` ← `Symbol`
- `side` ← `Buy/Sell` lowercased
- `direction` ← `O+BUY`=long, `O+SELL`=short, `C+SELL`=long, `C+BUY`=short
- `price` ← `TradePrice`
- `quantity` ← `|Quantity|` (absolute value)
- `date` ← parse `DateTime` ("YYYYMMDD;HHMMSS") to ms timestamp
- `assetType` ← "stock" default
- `fees` ← 0 (TBD — see gaps)
- `taxes` ← `Taxes` field
- `orderType` ← `OrderType`
- `externalId` ← hash of `ClientAccountID|Symbol|DateTime|TradePrice|Quantity`
- `brokerageAccountId` ← `ClientAccountID`

### Kraken Parser
Filter out non-equity rows (`aclass !== "equity_pair"`). Group by `ordertxid` and aggregate.

Per-order aggregation:
- `ticker` ← `pair` split on "/" → first part (e.g., "WAB/USD" → "WAB")
- `side` ← `type`
- `direction` ← "long" default
- `price` ← `sum(cost) / sum(vol)` (weighted avg)
- `quantity` ← `sum(vol)`
- `date` ← earliest fill timestamp
- `assetType` ← "stock" (map subclass etf/stock → "stock")
- `fees` ← `sum(fee)`
- `taxes` ← 0
- `orderType` ← `ordertype`
- `externalId` ← `ordertxid`
- `brokerageAccountId` ← empty (gap — see above)

## Import & Inbox Flow

### Upload Flow
1. User navigates to `/imports`
2. Selects brokerage (IBKR / Kraken)
3. Uploads CSV via file input
4. Client-side parse + normalize
5. Preview: trade count + duplicate count
6. User confirms → Convex mutation creates trades with `inboxStatus: "pending_review"`
7. Shows result (imported X, skipped Y duplicates)

### Inbox Review
- Table of pending trades: Date, Ticker, Side, Direction, Price, Qty, Asset Type, Source, Account
- Row actions: Accept, Delete, Edit
- Edit: direction, assetType, notes, tradePlanId
- Bulk: "Accept All" and "Delete All" buttons
- Empty state when no pending trades

## Convex Function Changes

### New file: `convex/imports.ts`
- `importTrades` (mutation): receives normalized trades array, dedup by externalId, creates pending trades
- `listInboxTrades` (query): returns pending_review trades for current user
- `acceptTrade` (mutation): sets inboxStatus to "accepted"
- `acceptAllTrades` (mutation): bulk accept all pending
- `deleteInboxTrade` (mutation): deletes a pending trade
- `updateInboxTrade` (mutation): updates editable fields on pending trade

### Modified: `convex/trades.ts`
- `listTrades`: add filter `inboxStatus === "accepted" || inboxStatus === undefined`
- `getTrade`: same filter
- `getTradesByTradePlan`: same filter
- `createTrade`: add `source: "manual"` default

### Modified: `convex/schema.ts`
- Add new fields to trades table definition
- Add new indexes

### No changes needed:
- `convex/lib/plCalculation.ts` — operates on whatever trades are passed (filtering happens upstream)
- `convex/campaigns.ts`, `convex/tradePlans.ts` — they call trade queries which handle filtering

## UI Implementation

### New route: `/imports` (`src/app/imports/page.tsx`)
**Upload section (top):**
- Brokerage selector dropdown (IBKR / Kraken)
- File input for CSV
- Preview area showing parsed trade count + skipped duplicates
- Import button

**Inbox section (bottom):**
- Table of pending_review trades
- Inline edit capability or edit modal for direction, assetType, notes, tradePlanId
- Accept/delete per-row actions
- Bulk accept/delete all buttons

### New client-side parsers: `src/lib/imports/`
- `src/lib/imports/types.ts` — shared types (NormalizedTrade, ParseResult)
- `src/lib/imports/ibkr-parser.ts` — IBKR CSV parser
- `src/lib/imports/kraken-parser.ts` — Kraken CSV parser

### Modified: `src/components/Header.tsx`
- Add "Import" nav link

### Dependencies
- `papaparse` — CSV parsing library (add via pnpm)
- `@types/papaparse` — TypeScript types

## Implementation Order

### Task 1: Schema changes
- Update `convex/schema.ts` with new trade fields and indexes
- Update `convex/trades.ts` createTrade to include `source: "manual"` default
- Add inbox status filters to existing trade queries (listTrades, getTrade, getTradesByTradePlan)
- Run `npx convex dev` to validate schema changes
- Files: `convex/schema.ts`, `convex/trades.ts`

### Task 2: Import Convex functions
- Create `convex/imports.ts` with all mutation/query functions
- importTrades, listInboxTrades, acceptTrade, acceptAllTrades, deleteInboxTrade, updateInboxTrade
- Files: `convex/imports.ts`

### Task 3: Client-side CSV parsers
- Install papaparse: `pnpm add papaparse @types/papaparse`
- Create shared types in `src/lib/imports/types.ts`
- Implement IBKR parser in `src/lib/imports/ibkr-parser.ts`
- Implement Kraken parser in `src/lib/imports/kraken-parser.ts`
- Files: `src/lib/imports/types.ts`, `src/lib/imports/ibkr-parser.ts`, `src/lib/imports/kraken-parser.ts`

### Task 4: Import page UI
- Create `/imports` page at `src/app/imports/page.tsx`
- Build upload section: brokerage selector, file input, preview, import button
- Build inbox table: pending trades list with accept/delete/edit actions
- Add inline edit for direction, assetType, notes, tradePlanId
- Add bulk accept/delete buttons
- Add "Import" link to header nav in `src/components/Header.tsx`
- Files: `src/app/imports/page.tsx`, `src/components/Header.tsx`

### Task 5: Integration testing & polish
- Test full flow: upload CSV → preview → import → inbox review → accept → verify in trades list
- Test dedup: import same CSV twice, verify skips
- Test with both IBKR and Kraken sample CSVs from `data/` directory
- Verify P&L calculations work correctly with imported trades
- Verify existing trade queries properly filter by inbox status

## Verification

1. **Schema**: Run `npx convex dev` — should deploy without errors
2. **Build**: `pnpm build` should pass
3. **Lint/Type**: `pnpm lint && pnpm typecheck` should pass
4. **Functional test**: Upload `data/ibkr.csv`, verify trades appear in inbox, accept them, verify they show in the trades list with correct P&L
5. **Functional test**: Upload `data/kraken.csv`, same verification
6. **Dedup test**: Re-upload same CSV, verify all trades are skipped
7. **Existing trades**: Verify manually created trades still work and display correctly
