# Portfolio Analytics Design

Date: 2026-04-27

## Context

Portfolios currently group trades, but they do not yet behave like first-class analytical objects.

The desired direction is to make portfolios answer:

- how much capital is in cash versus open positions
- which campaigns the portfolio is exposed to
- how total equity has changed over time
- how performance changes across selected timeframes
- how performance compares against useful benchmarks such as the S&P 500

This design keeps portfolios as overlays on the core `Campaign -> Trade Plan -> Trade` hierarchy. It gives portfolios stronger analytics without making them the parent structure for campaigns or trade plans.

The evergreen product guidance for this feature now lives in `docs/product/portfolio-analytics.md`.

## Product Decisions

### Keep portfolios as overlays

Portfolios should become analytically meaningful, but they should not become the core hierarchy.

Campaign exposure is derived through:

```text
portfolio -> trades -> trade plans -> campaigns
```

The same campaign may still have trades across multiple portfolios.

### Use a cash ledger

Portfolio cash should come from a canonical cash ledger.

The ledger records external cash movement:

- deposits
- withdrawals
- corrections

The ledger uses signed amounts:

- positive amounts add cash
- negative amounts remove cash

The first deposit acts as initial capital. There is no separate `starting_balance` entry type.

Transfers are deferred. Until linked portfolio-to-portfolio transfers exist, transfer-specific entry types duplicate deposits and withdrawals without improving the model.

### Include market pricing from day one

Market pricing should be included in the first portfolio analytics version.

The initial pricing model should use daily close prices, not live or intraday prices.

TradingView should not be used as the backend data source. The research conclusion was:

- TradingView is appropriate for charts, screenshots, or future charting UI
- TradingView is not a clean app-side market data API
- unofficial TradingView scraping or wrapper APIs are too fragile for this product

Twelve Data is the preferred day-one provider because it can cover US stocks, ETFs, and crypto through one API and has a useful free tier for a personal cached workflow.

### Resolve market mappings before trade acceptance

Unknown symbols should not be discovered by the nightly valuation job.

When an imported or manually created trade introduces a new `(assetType, ticker)` pair, the app should:

1. Check for an existing resolved market data instrument.
2. If none exists, attempt provider resolution immediately.
3. If resolution succeeds, create the mapping and continue.
4. If resolution fails, block trade save or import acceptance.
5. Let the user correct the provider symbol in the review flow.

This keeps price mapping problems inside the operational workflow where the user is already reviewing the trade.

### Store daily valuations

The portfolio equity chart should use stored daily valuation rows.

This was chosen over computing every historical day on demand because stored rows:

- make portfolio graphs fast
- avoid repeatedly replaying trade history across every day
- provide reviewable valuation state
- let the system record missing price coverage

Daily valuations are derived materialized analytics, not source of truth. They must remain recomputable from trades, cash ledger entries, and market price snapshots.

### Compute return by timeframe

Cumulative return should not be stored as one field on the valuation row.

Return depends on the selected timeframe. The app should compute it from:

- starting valuation
- ending valuation
- cash ledger entries inside the selected range

The initial period return formula is:

```text
(endingEquity - startingEquity - netExternalCashFlow) / startingEquity
```

External cash flow is subtracted because deposits and withdrawals are already reflected in total equity.

### Compare against benchmarks

Portfolio analytics should support benchmark comparison as review context.

The first benchmark should be the S&P 500, represented by a practical market instrument such as `SPY` unless the product later adopts a dedicated index data source.

Benchmark data should use the same market data instrument and market price snapshot model used for traded symbols. Benchmarks are analytical reference series, not portfolios and not participants in the cash ledger.

Benchmark return should be computed from cached close prices over the same selected timeframe as the portfolio return.

## Data Model

### `portfolioCashLedgerEntries`

Canonical external cash movement.

Fields:

```ts
{
  ownerId: string;
  portfolioId: Id<"portfolios">;
  date: number;
  amount: number;
  entryType: "deposit" | "withdrawal" | "correction";
  note?: string;
  createdAt: number;
  updatedAt: number;
}
```

Recommended indexes:

```ts
by_ownerId_and_portfolioId_and_date
by_ownerId_and_date
```

### `marketDataInstruments`

Internal symbol resolution cache.

Fields:

```ts
{
  ownerId: string;
  assetType: "stock" | "crypto";
  symbol: string;
  provider: "twelve_data";
  providerSymbol: string;
  resolutionStatus: "resolved" | "needs_review" | "ignored";
  lastResolvedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}
```

Recommended indexes:

```ts
by_ownerId_and_assetType_and_symbol
by_ownerId_and_resolutionStatus
```

Trades should not receive an `instrumentId` in the first version. Trades continue to store their ticker and asset type as execution data.

### `marketPriceSnapshots`

Cached daily close prices.

Fields:

```ts
{
  ownerId: string;
  instrumentId: Id<"marketDataInstruments">;
  date: string;
  close: number;
  fetchedAt: number;
  status: "ok" | "missing" | "error";
  errorMessage?: string;
}
```

Recommended indexes:

```ts
by_ownerId_and_instrumentId_and_date
by_ownerId_and_date
```

The first version should not store open, high, low, volume, currency, or adjusted close.

### `portfolioDailyValuations`

Materialized daily portfolio equity series.

Fields:

```ts
{
  ownerId: string;
  portfolioId: Id<"portfolios">;
  date: string;
  cashBalance: number;
  marketValue: number;
  totalEquity: number;
  priceCoverageStatus: "complete" | "partial" | "missing";
  missingSymbols: string[];
  computedAt: number;
}
```

Recommended indexes:

```ts
by_ownerId_and_portfolioId_and_date
by_ownerId_and_date
```

Definitions:

- `cashBalance`: cash not deployed in open positions at end of day
- `marketValue`: value of open positions using cached close prices
- `totalEquity`: `cashBalance + marketValue`
- `priceCoverageStatus`: whether all open positions had usable prices
- `missingSymbols`: symbols that blocked complete valuation
- `computedAt`: when the row was generated

Do not include cost basis, realized profit and loss, unrealized profit and loss, net contributions, or cumulative return in the day-one row.

### `marketDataRefreshRuns`

Operational audit trail for the daily refresh.

Fields:

```ts
{
  ownerId: string;
  runDate: string;
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed" | "partial";
  provider: "twelve_data";
  symbolsRequested: number;
  symbolsSucceeded: number;
  symbolsFailed: number;
  errorMessage?: string;
}
```

Recommended indexes:

```ts
by_ownerId_and_runDate
by_ownerId_and_status
```

## Scheduled Flow

Use one daily scheduled run around 9:00 p.m. Eastern Time.

The scheduled flow:

1. Find instruments needed for portfolio valuation.
2. Fetch daily close prices from Twelve Data.
3. Upsert market price snapshots.
4. Compute each portfolio's daily cash, market value, and total equity.
5. Upsert portfolio daily valuation rows.
6. Record a market data refresh run result.

Portfolio pages should read stored Convex data. They should not call market data providers directly.

## Portfolio Detail Experience

The future portfolio detail page should use the overview page pattern from the visual design system.

Primary modules:

- allocation summary: cash versus market value
- total equity
- return over selected timeframe
- benchmark comparison over selected timeframe
- equity chart
- campaign exposure table
- open positions table

The first return timeframes should likely be:

- year to date
- one year
- all time
- custom range

Campaign exposure should show the portfolio from the other direction:

- campaign name
- active exposure value
- share of market value
- related open positions
- link to campaign

## Deferred Work

Do not include these in the first version:

- portfolio valuation dirty ranges
- first-class portfolio positions table
- first-class portfolio campaign exposure table
- multiple market data providers
- live or intraday prices
- multi-currency valuation
- stock split and dividend handling
- adjusted historical price series
- linked transfers between portfolios

Portfolio valuation dirty ranges should be designed after the first full valuation system exists and the real recomputation requirements are visible.

## Implementation Notes

This feature should be built in Convex.

Expected backend areas:

- schema additions
- cash ledger queries and mutations
- market data instrument resolution
- Twelve Data action and provider adapter
- scheduled daily refresh
- portfolio valuation computation
- portfolio detail query expansion

Expected frontend areas:

- portfolio create/edit flow for initial deposit and cash ledger entries
- import/manual trade flow blocking unresolved price mappings
- portfolio detail allocation summary and chart
- portfolio campaign exposure section
- operational price mapping correction UI when resolution fails

Expected tests:

- cash ledger validation and cash balance computation
- import acceptance blocked by unresolved price mapping
- instrument auto-creation on successful provider resolution
- market price snapshot upsert behavior
- portfolio daily valuation computation
- period return calculation with deposits and withdrawals
- portfolio detail exposure derivation through trade plans and campaigns
