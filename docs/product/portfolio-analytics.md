# Portfolio Analytics

## Purpose

This document defines the intended product model for portfolio analytics in Trade Tracker.

Use it when changing portfolios, imports, trades, positions, market data, or portfolio review surfaces.

Portfolios remain capital-allocation overlays on trades. They should become analytically useful without becoming the main thesis hierarchy or a replacement for brokerage tools.

## Product Job

Portfolio analytics should help answer:

- how much of each portfolio is allocated to open positions versus cash
- which campaigns a portfolio is exposed to
- how total portfolio equity has changed over time
- how portfolio performance compares across useful date ranges

Portfolio analytics should not become:

- live market monitoring
- broker-grade account reconciliation
- a general personal finance system
- the parent structure for campaigns or trade plans

## Canonical Sources

The canonical sources for portfolio analytics are:

- trades, for executed buys and sells
- portfolio cash ledger entries, for external cash movement
- market data instrument mappings, for price lookup
- market price snapshots, for cached daily close prices

Daily portfolio valuations are derived from those sources. They are stored for performance and charting, but they must remain recomputable.

## Portfolio Cash Ledger

Portfolio cash ledger entries represent external cash movement that is not a trade.

Each entry should include:

- `ownerId`
- `portfolioId`
- `date`
- `amount`
- `entryType`
- optional `note`
- `createdAt`
- `updatedAt`

`amount` is the source of math:

- positive amounts add cash
- negative amounts remove cash

`entryType` is descriptive, not computational. Initial capital should be represented as a `deposit`, not as a separate starting-balance concept.

Initial supported entry types:

- `deposit`
- `withdrawal`
- `correction`

Do not add transfer-specific entry types until the product supports first-class linked movement between portfolios. Until then, a transfer into one portfolio is functionally a deposit, and a transfer out is functionally a withdrawal.

## Market Data Instruments

Market data instruments are an internal symbol resolution cache.

They should prevent provider-specific symbols from leaking into trades, portfolio pages, or analytics logic.

Each record should include:

- `ownerId`
- `assetType`
- `symbol`
- `provider`
- `providerSymbol`
- `resolutionStatus`
- optional `lastResolvedAt`
- optional `lastError`
- `createdAt`
- `updatedAt`

Initial provider:

- `twelve_data`

Initial resolution statuses:

- `resolved`
- `needs_review`
- `ignored`

Trades remain the execution record and should continue to store their own `ticker` and `assetType`. Do not add `instrumentId` to trades for the first version.

Instrument records should be created automatically when a new trade ticker appears. There should be no separate "new ticker" workflow.

## Price Mapping Resolution

Price mapping should be resolved during trade creation and import review, not discovered later during the nightly valuation job.

When an imported or manually created trade has a new `(assetType, ticker)` pair:

1. Check for an existing resolved market data instrument.
2. If none exists, attempt provider resolution immediately.
3. If provider resolution succeeds, create the instrument record and allow the trade to be saved or accepted.
4. If provider resolution fails, block the save or acceptance flow and show a clear price-mapping issue.
5. Allow the user to correct the provider symbol in the review flow.

This keeps unresolved pricing issues inside the operational review workflow instead of allowing portfolio valuation to fail later without context.

Closed positions do not delete instrument records. Historical valuations and future trades may still need the mapping.

## Market Price Snapshots

Market price snapshots are cached external price observations.

Each record should include:

- `ownerId`
- `instrumentId`
- `date`
- `close`
- `fetchedAt`
- `status`
- optional `errorMessage`

Initial statuses:

- `ok`
- `missing`
- `error`

The first version should store regular close prices only.

Do not store open, high, low, volume, currency, or adjusted close in the first version. Multi-currency valuation, stock splits, dividends, and adjusted historical series are long-term follow-ups.

## Scheduled Market Data Refresh

The first version should use a single scheduled daily refresh after market close.

Recommended timing:

- one run around 9:00 p.m. Eastern Time

The scheduled job should:

1. Find instruments needed for portfolio valuation.
2. Fetch daily close prices from the configured provider.
3. Store market price snapshots.
4. Compute and upsert daily portfolio valuations.
5. Store an operational refresh run record.

Portfolio pages should read stored price snapshots and daily valuations. They should not call market data providers directly.

## Daily Portfolio Valuations

Daily portfolio valuations are materialized analytics rows for portfolio charts and review.

Each row should include:

- `ownerId`
- `portfolioId`
- `date`
- `cashBalance`
- `marketValue`
- `totalEquity`
- `priceCoverageStatus`
- `missingSymbols`
- `computedAt`

Meanings:

- `cashBalance` is cash not deployed in open positions at end of day.
- `marketValue` is the priced value of open positions at end of day.
- `totalEquity` is `cashBalance + marketValue`.
- `priceCoverageStatus` records whether all open positions had usable prices.
- `missingSymbols` lists symbols that prevented full valuation.
- `computedAt` records when the row was generated.

Initial price coverage statuses:

- `complete`
- `partial`
- `missing`

Do not store cost basis, realized profit and loss, unrealized profit and loss, net contributions, or cumulative return in the first version of the daily valuation row.

## Return Calculation

Cumulative return depends on the selected timeframe, so it should be computed from valuation rows and cash ledger entries instead of stored as a single portfolio field.

For a selected period, the product should fetch:

- the starting valuation
- the ending valuation
- cash ledger entries inside the selected period

A simple first return formula is:

```text
(endingEquity - startingEquity - netExternalCashFlow) / startingEquity
```

External cash flow must be removed from return math because total equity already includes deposits and withdrawals.

For example, a portfolio that starts at `$10,000`, receives a `$5,000` deposit, and ends at `$15,000` has a `0%` return, not a `50%` return.

## Campaign Exposure

Portfolio campaign exposure is derived, not directly assigned.

The relationship remains:

```text
portfolio -> trades -> trade plans -> campaigns
```

The portfolio detail surface should eventually show campaign exposure from the portfolio direction:

- campaign name
- active exposure value
- share of portfolio market value
- related open positions
- link to the campaign

This does not make portfolios the parent of campaigns or trade plans.

## Operational Audit

The market data refresh should store a run record for troubleshooting.

Each run should include:

- `ownerId`
- `runDate`
- `startedAt`
- optional `completedAt`
- `status`
- `provider`
- `symbolsRequested`
- `symbolsSucceeded`
- `symbolsFailed`
- optional `errorMessage`

Initial statuses:

- `running`
- `completed`
- `failed`
- `partial`

This helps explain missing or stale portfolio graph data.

## Deferred Work

Do not include these in the first version:

- portfolio valuation dirty ranges
- first-class portfolio positions table
- first-class portfolio campaign exposure table
- multiple market data providers
- live or intraday market data
- multi-currency valuation
- stock split and dividend handling
- adjusted historical price series
- linked transfers between portfolios

Portfolio valuation dirty ranges should be revisited after the full first version exists and the recomputation needs are clearer.

