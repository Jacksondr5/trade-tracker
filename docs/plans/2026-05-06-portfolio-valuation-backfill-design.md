# Portfolio Valuation Backfill Design

## Goal

Expose an operator-only manual control to recompute stored portfolio daily valuation rows for a historical date range.

## Approach

Use the existing Market Data Health page because it already owns operational repair controls and has an operator access gate. Add a public action in `convex/marketDataHealth.ts` that validates operator access, accepts a `startDate` and `endDate`, and calls `internal.portfolioAnalytics.backfillHistoricalDailyValuationsForOwner`.

The UI will add a "Portfolio valuation recompute" panel below the existing historical price backfill controls. The panel will use two date inputs and a submit button. Status copy will distinguish this recompute from price fetching: it recalculates valuation rows from existing trades, cash ledger entries, and cached price snapshots.

## Error Handling

Date validation stays in the existing internal valuation backfill mutation. Operator authorization uses the existing `MARKET_DATA_HEALTH_OPERATOR_IDS` allowlist. The UI will surface thrown errors through the existing action error alert.

## Testing

Add Convex tests that reject non-operators and allow configured operators to queue a valuation backfill. Run the focused market data health test and the standard type/lint checks after implementation.
