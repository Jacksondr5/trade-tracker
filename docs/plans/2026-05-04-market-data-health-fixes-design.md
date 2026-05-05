# Market Data Health Fixes Design

## Source

NYSE publishes the holiday calendar for all NYSE markets at https://www.nyse.com/trade/hours-calendars. As of May 4, 2026, that page lists full-market holidays for 2026, 2027, and 2028 and separately notes early-close sessions. This design treats early-close sessions as open because a daily close is still available.

## Design

Daily market data refreshes should produce portfolio valuation dates only for configured US market days. A refresh date is open when it is a weekday and is not present in a checked-in NYSE full-market holiday list. If a date is closed, `refreshDailyPriceSnapshots` returns a zero-job result and does not create refresh run records or fetch jobs.

This intentionally skips crypto on closed equity-market days. The product invariant is simpler: when Trade Tracker has a daily market-data refresh date, the portfolio universe was refreshed together; closed-market dates are absent rather than partially populated.

The health dashboard will expose the job target date/range, keep long error messages readable through hover text, display backfill run labels with `-` instead of `:`, and show a red failed-job count beside the Market Data navigation item.

## Testing

Add direct unit coverage for the calendar helper, Convex tests for weekday/weekend/holiday refresh behavior, Convex query coverage for failed-job nav count, and UI-focused assertions where existing tests cover formatting.
