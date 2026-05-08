# Portfolio Valuation Backfill Design

## Goal

Expose an authenticated manual control to recompute a user's stored portfolio daily valuation rows for a historical date range.

## Approach

Use the existing Market Data Health page because it already owns operational repair controls. Add a public action in `convex/marketDataHealth.ts` that requires authentication, accepts a `startDate` and `endDate`, and calls `internal.portfolioAnalytics.backfillHistoricalDailyValuationsForOwner` for the authenticated user's owner id.

The UI will add a "Portfolio valuation recompute" panel below the existing historical price backfill controls. The panel will use two date inputs and a submit button. Status copy will distinguish this recompute from price fetching: it recalculates valuation rows from existing trades, cash ledger entries, and cached price snapshots.

## Error Handling

Date validation stays in the existing internal valuation backfill mutation. Authentication uses the standard `requireUser` path, and the internal mutation scopes recomputation to that owner id. The UI will surface thrown errors through the existing action error alert.

## Testing

Add Convex tests that keep provider-credit controls operator-only while allowing authenticated users to queue valuation backfill for their own data. Run the focused market data health test and the standard type/lint checks after implementation.
