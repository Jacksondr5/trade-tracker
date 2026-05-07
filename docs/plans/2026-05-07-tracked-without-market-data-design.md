# Tracked Without Market Data Design

## Context

Portfolio valuation currently treats instrument mappings with
`resolutionStatus: "ignored"` as accepted for trade creation and import review,
but unpriceable during valuation.

That means a trade for an ignored open position still affects cash, but the open
position contributes no market value. The position remains visible in portfolio
structure and issue lists, but total equity can understate the portfolio by the
full value of that position.

Some instruments will not have usable provider market data. Those instruments
still need a practical portfolio valuation fallback.

## Decision

Rename the user-facing behavior from **Ignore** to **Track without market data**.

For the first implementation, keep the stored enum value as `ignored` to avoid a
schema migration. Reinterpret that status as:

- do not fetch external provider prices
- do not count the instrument as a provider fetch success or failure
- derive a user-scoped fallback price from the latest trade price
- include the open position in portfolio market value when a fallback price
  exists

## Data Model

Keep `marketPriceSnapshots` as global provider data.

Add a second table for user-scoped fallback marks:

```ts
portfolioPriceMarks: {
  ownerId: string;
  portfolioId: Id<"portfolios">;
  assetType: "stock" | "crypto";
  direction: "long" | "short";
  symbol: string;
  date: string;
  price: number;
  source: "last_trade";
  sourceTradeId: Id<"trades">;
  createdAt: number;
  updatedAt: number;
}
```

Recommended indexes:

```ts
by_ownerId_and_portfolioId_and_assetType_and_symbol_and_direction_and_date
by_ownerId_and_portfolioId_and_direction_and_date
```

The table is separate from `marketPriceSnapshots` because fallback marks are
owner- and portfolio-specific. Provider prices are global observations, while a
latest trade price can differ by owner, portfolio, and trade history.

## Daily Price Preparation

The daily market data refresh keeps two streams:

1. Resolved instruments continue through provider fetch jobs and write
   `marketPriceSnapshots`.
2. Tracked-without-market-data instruments are processed internally and write
   `portfolioPriceMarks`.

The internal mark step should derive one mark per open
`ownerId + portfolioId + assetType + symbol + direction` for the valuation date.

The mark price is the most recent trade price at or before the valuation date
for that same owner, portfolio, asset type, symbol, and direction. Fees and
taxes are not included in the mark price; they already affect cash through the
trade cash-flow calculation.

If no eligible trade exists, no mark is written and valuation should treat the
position as missing.

## Valuation

Portfolio valuation should consume prepared price observations, not inspect
trade history to invent prices on demand.

For each open position:

- `resolved` instrument: use the provider close from `marketPriceSnapshots`
- `ignored` instrument: use the derived price from `portfolioPriceMarks`
- missing instrument or missing prepared price: add the ticker to
  `missingSymbols`

Long positions use `quantity * price`.

Short positions keep the existing sign convention and use `-(quantity * price)`.
Cash from short sales is already reflected in the cash balance, so this negative
market value represents the liability to cover.

## Portfolio Detail

Portfolio detail should surface tracked-without-market-data positions as priced
when a portfolio price mark exists.

The data issues panel should no longer present those instruments as needing a
market-data mapping merely because they are tracked without provider data. It
should only show them as an issue when no fallback mark exists for the latest
valuation date.

## UI Copy

Change user-facing copy:

- `Ignored` -> `Tracked without market data`
- `Mark ignored` -> `Track without market data`
- helper copy should explain that the app will use the latest trade price for
  portfolio valuation and will not fetch provider prices for that symbol

The database enum can remain `ignored` until a later cleanup migration.

## Testing

Add backend tests for:

- ignored/tracked instruments write fallback price marks during daily refresh
- ignored/tracked instruments do not enqueue provider fetch jobs
- valuation includes fallback market value
- short fallback valuation uses negative market value
- closed positions do not carry fallback market value
- portfolio overview reports fallback-priced positions as priced

Update UI tests only if existing copy assertions or selectors require it.
