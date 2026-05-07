# Portfolio Valuation Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an operator-only Market Data Health control that queues historical portfolio daily valuation recomputation.

**Architecture:** The existing internal valuation backfill mutation remains the computation entry point. A new operator-gated action in `convex/marketDataHealth.ts` exposes it safely to the health UI, and the React page adds a compact date-range form beside the existing operational triggers.

**Tech Stack:** Convex actions/mutations, Next.js client component, shared E2E test ids, Vitest with `convex-test`.

---

## Task 1: Backend Action

**Files:**

- Modify: `convex/marketDataHealth.ts`
- Test: `convex/marketDataHealth.test.ts`

**Steps:**

1. Add `triggerValuationBackfill` action with `startDate` and `endDate` string args.
2. Gate it with `requireMarketDataHealthOperator`.
3. Call `internal.portfolioAnalytics.backfillHistoricalDailyValuationsForOwner` using the authenticated operator id.
4. Return the internal mutation result.
5. Add tests for non-operator rejection and configured operator success.

## Task 2: UI Control

**Files:**

- Modify: `shared/e2e/testIds.ts`
- Modify: `src/app/(app)/market-data/health/MarketDataHealthPageClient.tsx`

**Steps:**

1. Add shared test ids for valuation backfill start date, end date, and submit.
2. Add `useAction(api.marketDataHealth.triggerValuationBackfill)`.
3. Add state for valuation backfill dates and pending state.
4. Add a "Portfolio valuation recompute" panel under the existing historical price backfill panel.
5. Submit the date range and show queued date count.

## Task 3: Verification

**Commands:**

- `pnpm test convex/marketDataHealth.test.ts`
- `pnpm typecheck`
- `pnpm lint`
