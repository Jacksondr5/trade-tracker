# Portfolio Analytics Implementation Plan


**Goal:** Build first-class portfolio analytics for cash allocation, market-valued equity history, timeframe returns, benchmark comparison, and campaign exposure.

**Architecture:** Convex remains the system of record. Trades and cash ledger entries are canonical inputs; market data instruments and price snapshots cache external daily close data; portfolio daily valuations materialize the chartable equity series. Portfolio pages read Convex data only and never call market data providers directly.

**Tech Stack:** Next.js App Router, Convex, Clerk auth, TanStack React Form, Vitest, Playwright, Twelve Data.

---

## References

- Evergreen spec: `docs/product/portfolio-analytics.md`
- Design record: `docs/plans/2026-04-27-portfolio-analytics-design.md`
- Convex rules: `convex/_generated/ai/guidelines.md`
- Linear project: `Portfolio Analytics`
- Linear tickets: `JAC-169`, `JAC-168`, `JAC-170`, `JAC-171`, `JAC-172`, `JAC-175`, `JAC-173`, `JAC-174`

## Before Starting Any Ticket

1. Create a new git worktree for the Linear ticket.
2. Move the Linear ticket to `In Progress`.
3. Read `docs/product/README.md`, `docs/product/portfolio-analytics.md`, and `convex/_generated/ai/guidelines.md`.
4. Verify `.env.local` and `node_modules/` exist in the worktree. Copy/install per `AGENTS.md` if needed.
5. Do not move the ticket to `In Review` or `Done`; let the PR integration do that.

## Task 1: `JAC-169` Add Portfolio Analytics Data Model

**Files:**

- Modify: `convex/schema.ts`
- Create: `convex/portfolioAnalytics.test.ts`

**Steps:**

1. Write tests that insert sample documents for:
   - `portfolioCashLedgerEntries`
   - `marketDataInstruments`
   - `marketPriceSnapshots`
   - `portfolioDailyValuations`
   - `marketDataRefreshRuns`
2. Add schema tables and indexes exactly matching the evergreen spec.
3. Run `pnpm typecheck`.
4. Run `pnpm test convex/portfolioAnalytics.test.ts`.
5. Commit with `feat: add portfolio analytics schema`.

**Sharp Edges:**

- Do not add `instrumentId` to `trades`.
- Do not add `portfolioValuationDirtyRanges`.
- Use index names that include every indexed field.
- Store valuation dates consistently. Prefer a date string such as `YYYY-MM-DD` for market-day records unless an implementation plan deliberately chooses timestamps throughout.

## Task 2: `JAC-168` Build Portfolio Cash Ledger Backend And UI

**Files:**

- Create: `convex/portfolioCashLedger.ts`
- Test: `convex/portfolioCashLedger.test.ts`
- Modify: `src/app/(app)/portfolios/[id]/PortfolioDetailPageClient.tsx`
- Consider creating route-local component: `src/app/(app)/portfolios/[id]/PortfolioCashLedgerSection.tsx`

**Steps:**

1. Write backend tests for create, update, delete, list, owner isolation, and signed amount validation.
2. Implement Convex queries/mutations with `requireUser` and ownership checks.
3. Add a compact ledger section to portfolio detail.
4. Use existing shared UI/form primitives before adding route-local inputs.
5. Run `pnpm test convex/portfolioCashLedger.test.ts`.
6. Run `pnpm typecheck`.
7. Commit with `feat: add portfolio cash ledger`.

**Sharp Edges:**

- Initial capital is a `deposit`.
- `entryType` is descriptive; math uses signed `amount`.
- Do not add transfer-specific entry types yet.

## Task 3: `JAC-170` Add Market Data Provider And Instrument Resolution

**Files:**

- Create: `convex/marketData.ts`
- Create: `convex/lib/marketData/twelveData.ts`
- Test: `convex/marketData.test.ts`
- Modify: `.env.example` if this repo has one; otherwise document required `TWELVE_DATA_API_KEY` in the plan or ticket notes.

**Steps:**

1. Write pure tests for symbol normalization and provider response parsing.
2. Write Convex tests for resolved, failed, and existing instrument lookup paths.
3. Implement an internal provider adapter for Twelve Data.
4. Implement public or internal Convex functions for resolving `(assetType, ticker)`.
5. Ensure the provider key is read server-side only.
6. Run targeted tests and `pnpm typecheck`.
7. Commit with `feat: add market data instrument resolution`.

**Sharp Edges:**

- The first version has one provider: `twelve_data`.
- Failed resolution should store `needs_review` plus useful error context.
- Do not build a broad user-facing instrument settings page in this ticket.

## Task 4: `JAC-171` Block Trade Creation And Import Acceptance On Unresolved Price Mappings

**Files:**

- Modify: `convex/trades.ts`
- Modify: `convex/imports.ts`
- Modify: `src/app/(app)/trades/new/NewTradePageClient.tsx`
- Modify: `src/app/(app)/imports/ImportsPageClient.tsx`
- Modify: `src/app/(app)/imports/components/inbox-table.tsx`
- Test: `convex/trades.test.ts`
- Test: `convex/imports.test.ts`

**Steps:**

1. Write tests proving unresolved mappings block manual trade creation and inbox trade acceptance.
2. Write tests proving known/resolvable mappings do not add extra user friction.
3. Wire the backend creation/acceptance paths to market data resolution.
4. Add clear UI feedback for unresolved mapping issues.
5. Add a narrow correction path for provider symbols where needed.
6. Run `pnpm test convex/trades.test.ts convex/imports.test.ts`.
7. Run `pnpm typecheck`.
8. Commit with `feat: require price mapping for trades`.

**Sharp Edges:**

- Keep operational copy direct: `Price mapping required` is better than generic errors.
- App-owned Playwright selectors must use `getByTestId()` if browser tests are added.
- Avoid resolving symbols from the client directly.

## Task 5: `JAC-172` Implement Nightly Price Snapshot Refresh

**Files:**

- Modify/Create: `convex/crons.ts`
- Modify: `convex/marketData.ts`
- Test: `convex/marketData.test.ts`

**Steps:**

1. Write tests for price snapshot upsert behavior and run auditing.
2. Implement a Convex scheduled job for one daily run around 9 p.m. Eastern.
3. Build the instrument universe from resolved instruments needed for portfolio valuation and benchmarks.
4. Fetch daily close prices through the provider adapter.
5. Upsert `marketPriceSnapshots`.
6. Record `marketDataRefreshRuns`.
7. Run targeted tests and `pnpm typecheck`.
8. Commit with `feat: refresh nightly market prices`.

**Sharp Edges:**

- Portfolio pages must read cached prices only.
- Missing provider prices should produce `missing` or `error` snapshots, not crash the run.
- Keep benchmark instruments such as `SPY` in the refresh universe.

## Task 6: `JAC-175` Backfill Historical Market Data

**Files:**

- Modify: `convex/marketData.ts`
- Consider create: `convex/marketDataBackfill.ts`
- Test: `convex/marketData.test.ts`

**Steps:**

1. Write tests for idempotent historical snapshot upserts.
2. Determine historical symbol universe from existing trades plus benchmark instruments.
3. Resolve missing instruments before fetching historical prices.
4. Fetch historical daily close prices from the provider.
5. Upsert historical `marketPriceSnapshots`.
6. Record backfill results in an operational run record or equivalent audit path.
7. Run targeted tests and `pnpm typecheck`.
8. Commit with `feat: backfill historical market prices`.

**Sharp Edges:**

- Re-running the backfill must not duplicate snapshots.
- Failed symbols must be visible for follow-up.
- This should be callable operationally, but not from the portfolio page UI.

## Task 7: `JAC-173` Compute Daily Portfolio Valuations And Timeframe Returns

**Files:**

- Create: `convex/portfolioValuations.ts`
- Test: `convex/portfolioValuations.test.ts`
- Modify: `convex/portfolios.ts`

**Steps:**

1. Write tests for cash-only portfolio valuation.
2. Write tests for buy/sell trade cash flow and open market value.
3. Write tests for missing price coverage.
4. Write a deposit-only return test that returns `0%`.
5. Implement daily valuation computation.
6. Implement date-range equity series query.
7. Implement timeframe return calculation:

   ```text
   (endingEquity - startingEquity - netExternalCashFlow) / startingEquity
   ```

8. Implement benchmark return calculation from cached close prices for the same selected period.
9. Run `pnpm test convex/portfolioValuations.test.ts`.
10. Run `pnpm typecheck`.
11. Commit with `feat: compute portfolio valuations`.

**Sharp Edges:**

- Daily rows store only cash balance, market value, total equity, coverage status, missing symbols, and computed timestamp.
- Do not store cumulative return as a daily valuation field.
- Portfolio cash ledger affects return math, benchmark data does not.

## Task 8: `JAC-174` Redesign Portfolio Detail Analytics Surface

**Files:**

- Modify: `src/app/(app)/portfolios/[id]/PortfolioDetailPageClient.tsx`
- Consider create: `src/app/(app)/portfolios/[id]/PortfolioAllocationSummary.tsx`
- Consider create: `src/app/(app)/portfolios/[id]/PortfolioEquityChart.tsx`
- Consider create: `src/app/(app)/portfolios/[id]/PortfolioCampaignExposure.tsx`
- Modify: `convex/portfolios.ts`
- Test: add focused Vitest tests for formatting/helpers if introduced
- Test: add Playwright only if stable `data-testid` hooks are included

**Steps:**

1. Expand portfolio detail query to include allocation, equity series, selected-period return, benchmark comparison, open positions, and campaign exposure.
2. Build the overview summary row: cash, market value, total equity, selected-period return.
3. Add benchmark comparison for the selected period.
4. Add equity chart from `portfolioDailyValuations`.
5. Add campaign exposure derived through trades -> trade plans -> campaigns.
6. Show missing price coverage calmly and explicitly.
7. Verify responsive layout manually with Playwright interactive if UI changes are substantial.
8. Run `pnpm typecheck`, `pnpm lint`, and relevant tests.
9. Commit with `feat: add portfolio analytics overview`.

**Sharp Edges:**

- Follow `docs/product/visual-design-system.md` overview page guidance.
- Do not make portfolios look like campaign/trade-plan parents.
- Use stable `data-testid` hooks for app-owned browser coverage.

## Suggested Execution Order

1. `JAC-169`
2. `JAC-168` and `JAC-170` can proceed after schema lands
3. `JAC-171` after market data resolution
4. `JAC-172` after market data resolution
5. `JAC-175` after schema and market data resolution
6. `JAC-173` after cash ledger, nightly snapshots, and historical backfill
7. `JAC-174` after valuation queries exist

## Final Validation Before Project Completion

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For UI work, also run:

```bash
pnpm dev
npx convex dev
pnpm test:e2e:setup
pnpm test:e2e
```

Use the Playwright interactive workflow first for iterative UI checks, per `AGENTS.md`.

