# Market Data Health Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Skip daily market-data refresh jobs on non-market days and improve market-data health visibility.

**Architecture:** Add a small Convex market-calendar helper with checked-in NYSE full-market holidays for 2026-2028. Use it in the daily refresh planner before creating run records or jobs, and expose failed-job counts through a bounded owner-scoped query for navigation.

**Tech Stack:** Convex, Next.js App Router, React, Vitest, Playwright test-id contracts.

---

## Task 1: Market Calendar Helper

**Files:**

- Create: `convex/lib/marketCalendar.ts`
- Test: `convex/marketData.test.ts`

**Steps:**

1. Add `NYSE_FULL_MARKET_HOLIDAYS` with 2026-2028 dates from NYSE.
2. Add `isDailyMarketDataRefreshDate(date: string): boolean`.
3. Test weekday open, weekend closed, and NYSE holiday closed.

## Task 2: Skip Closed Daily Refresh Dates

**Files:**

- Modify: `convex/marketData.ts`
- Test: `convex/marketData.test.ts`

**Steps:**

1. Import the calendar helper.
2. Return zero jobs before owner universe lookup when the run date is closed.
3. Assert no refresh run or jobs are created for weekend/holiday dates.

## Task 3: Health Query Count

**Files:**

- Modify: `convex/marketDataHealth.ts`
- Test: `convex/marketDataHealth.test.ts`

**Steps:**

1. Add an owner-scoped `getFailedFetchJobCount` query.
2. Use the existing bounded status index.
3. Test owner scoping and failed-only counting.

## Task 4: Health Dashboard Table Formatting

**Files:**

- Modify: `src/app/(app)/market-data/health/MarketDataHealthPageClient.tsx`

**Steps:**

1. Display a Date column in the jobs table using `date` or `startDate - endDate`.
2. Preserve full error messages in `title`.
3. Format backfill run labels by replacing `:` with `-` for display only.

## Task 5: Navigation Failed-Job Badge

**Files:**

- Modify: `src/components/app-shell/AppShell.tsx`
- Modify: `shared/e2e/testIds.ts`

**Steps:**

1. Query failed job count from the navigation component.
2. Render a red count marker on the Market Data nav item when count is greater than zero.
3. Add a stable test id for the badge.

## Task 6: Verification

**Commands:**

- `pnpm exec tsc -p convex/tsconfig.json --noEmit`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
