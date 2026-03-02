# Trade Import Matching & Quick-Create Design

## Problem

The trade import workflow requires manual linking of every imported trade to a trade plan. This is tedious when:

1. A trade clearly matches an existing trade plan by instrument symbol
2. A trade plan doesn't exist yet and needs to be created before linking (e.g., Bravos service trades)

## Solution

Three connected features that reduce friction in the import-to-trade-plan linking flow.

## Feature 1: Auto-match at Import Time

**Backend (`convex/imports.ts` — `importTrades` mutation):**

When trades are imported, auto-match them to trade plans:

- Query all open trade plans (status: idea, watching, active) for the user
- Build a map of `instrumentSymbol -> tradePlan[]`
- For each inbox trade candidate with no `tradePlanId` already set:
  - Look up its normalized ticker in the map
  - If exactly one plan matches, set `tradePlanId` automatically
  - If zero or multiple plans match, leave `tradePlanId` unset

Reuses the existing ownership-verified trade plan caching pattern in the mutation.

Unit tests are required for the auto-match logic covering: single match, multiple matches, no match, and pre-set tradePlanId cases.

**Frontend (`inbox-table.tsx` — trade plan dropdown):**

Sort the trade plan dropdown so matching plans appear first:

1. Plans where `instrumentSymbol` matches the trade's ticker — listed first
2. All other open plans — listed below, separated by an `<optgroup>` or visual divider
3. "None" remains the first option

This is a pure frontend sort using data already preloaded.

## Feature 2: Inbox Trade Suggestions on Trade Plan Detail Page

**Backend (`convex/imports.ts` — new query `listInboxTradesForTradePlan`):**

- Args: `tradePlanId`
- Fetches the trade plan to get its `instrumentSymbol`
- Returns inbox trades where `status === "pending_review"` AND either:
  - `tradePlanId === this plan's ID` (already assigned), OR
  - `ticker === instrumentSymbol` AND `tradePlanId` is unset (unassigned match)
- Each result includes `matchType: "assigned" | "suggested"`

**Frontend (`TradePlanDetailPageClient.tsx`):**

Pending inbox trades are mixed into the existing linked trades table:

- Sorted to the top of the table, above accepted trades
- Visually distinct with a Badge (`info` variant): "Suggested" for unassigned ticker matches, "Pending" for already-assigned
- Columns match the existing table (Date, Ticker, Account, Side, Qty, Price)
- P&L column replaced with: portfolio `<select>` dropdown + accept button (green checkmark)
- Accept calls existing `acceptTrade` mutation with the trade plan ID pre-set and selected portfolio
- On acceptance, the row reactively transitions to a normal trade row via Convex subscriptions

Page preloads the new `listInboxTradesForTradePlan` query and portfolios.

## Feature 3: Quick-Create Trade Plan from Inbox

Next to the trade plan dropdown in `inbox-table.tsx`, add a button that opens an inline form/popover:

- **Name** — text input
- **Instrument symbol** — text input, pre-filled from the trade's ticker
- **Campaign** — dropdown of active/planning campaigns

On submit: calls existing `createTradePlan` mutation, then auto-selects the new plan on that inbox trade.

This reuses the same mutation and form pattern from the campaign detail page. The campaign detail page already has this creation flow and needs no changes.

For external service trade plans (e.g., Bravos), links are stored as notes using the existing `notes` table (which supports `tradePlanId` + `content` + `chartUrls`). No new schema or data structures.

## Schema Changes

None. All features build on existing tables and fields.

## Approach Notes

- Auto-match happens at import time; it does not retroactively match existing inbox trades when a new trade plan is created. The trade plan detail page suggestions (Feature 2) cover that gap.
- The trade plan dropdown sorting (Feature 1) provides a lightweight read-time enhancement for manual selection when auto-match doesn't apply.
