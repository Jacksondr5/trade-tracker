# Trades Search Filters Design

## Summary

Replace the trades page's date quick-filter buttons with a single filter bar that supports:

- start date
- end date
- partial ticker matching
- portfolio selection, including trades with no portfolio
- brokerage account selection

All filters remain combinable and URL-driven.

## Goals

- keep the trades page focused on scannable execution review
- remove duplicate date filtering affordances
- support the most common ways the user narrows the execution record
- preserve stable newest-first ordering and existing cursor pagination

## UX Design

The trades page will expose a single filter row above the table:

- `Start date` and `End date` date pickers
- `Ticker` text input
- `Portfolio` select with `Any portfolio`, `No portfolio`, then named portfolios
- `Account` select with `Any account`, then known imported accounts

Filter state will live in the URL so refresh, back/forward navigation, and shared links continue to work.

Date and select filters apply immediately. The ticker filter applies after a short pause while typing to avoid a full navigation on every keystroke.

## Backend Design

The existing `api.trades.listTradesPage` query only supports date bounds. It will be extended to support:

- `ticker` for case-insensitive partial matching
- `portfolioId` for exact portfolio filtering
- `withoutPortfolio` for trades with no portfolio
- `accountSource` and `accountId` for exact brokerage-account filtering

Date ordering still comes from the existing `by_owner_date` index. Exact filters are applied with Convex query filters. Partial ticker matching is applied in server code.

Because partial ticker matching can reject some rows after pagination, the query will switch to a filter-aware pagination strategy when a ticker filter is active:

- paginate the underlying date-ordered query in batches
- collect only matching trades
- buffer extra matches from the last scanned batch into an opaque cursor payload
- resume from that buffered state on the next page

This preserves correct pagination without skipping filtered rows.

## Data Sources

- portfolio options come from `api.portfolios.listPortfolios`
- account labels come from `api.accountMappings.listAccountMappings`
- account option values come from `api.accountMappings.listKnownBrokerageAccounts`

Account labels prefer the friendly mapping name and fall back to the raw account ID.

## Testing

- add unit tests for shared trade-filter URL parsing
- add Convex query tests for combined filters and ticker-aware pagination
- verify the trades page in Playwright against the running app
