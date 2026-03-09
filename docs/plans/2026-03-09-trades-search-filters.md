# Trades Search Filters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the trades page date quick-filter buttons with combined date, ticker, portfolio, and account filters backed by server-side pagination.

**Architecture:** Shared URL parsing in `src/lib/trades/filters.ts` will keep the server route and client UI aligned. `convex/trades.ts` will extend the existing date-ordered query with exact filters and a custom buffered cursor path for partial ticker matching so pagination stays correct.

**Tech Stack:** Next.js App Router, React, Convex, Vitest, Playwright

---

### Task 1: Add shared trades filter parsing

**Files:**
- Create: `src/lib/trades/filters.ts`
- Test: `src/lib/trades/filters.test.ts`

**Step 1: Write the failing test**

Add tests that cover:

- trimming and normalizing ticker, portfolio, and account URL params
- parsing `portfolio=none`
- rejecting invalid account keys
- building server query args from URL params

**Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/trades/filters.test.ts`
Expected: FAIL because the helper file does not exist yet.

**Step 3: Write minimal implementation**

Add a helper module that:

- normalizes trade filter URL params
- parses date bounds
- converts account keys into `{ source, accountId }`
- builds the `listTradesPage` query args

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/trades/filters.test.ts`
Expected: PASS

### Task 2: Extend the trades query

**Files:**
- Modify: `convex/trades.ts`
- Test: `convex/trades.test.ts`

**Step 1: Write the failing test**

Add query tests that cover:

- partial ticker matching
- `No portfolio` filtering
- account filtering
- combined filters
- multi-page ticker filtering without skipped rows

**Step 2: Run test to verify it fails**

Run: `pnpm test convex/trades.test.ts`
Expected: FAIL before the query supports the new filters.

**Step 3: Write minimal implementation**

Update `api.trades.listTradesPage` to:

- accept the new filter args
- keep date ordering via `by_owner_date`
- apply exact filters in Convex query filters
- use buffered custom cursors when ticker filtering is active

**Step 4: Run test to verify it passes**

Run: `pnpm test convex/trades.test.ts`
Expected: PASS

### Task 3: Update the trades page route and client

**Files:**
- Modify: `src/app/(app)/trades/page.tsx`
- Modify: `src/app/(app)/trades/TradesPageClient.tsx`

**Step 1: Write the failing test**

If route/client tests are added later, cover:

- removing date quick-filter buttons
- URL updates for the new filters
- pagination reset on filter changes
- account option rendering with mapping fallback

**Step 2: Run focused validation**

Run the relevant tests from Tasks 1 and 2 first, then lint/typecheck the changed files if needed.

**Step 3: Write minimal implementation**

Update the server route to preload known brokerage accounts and parse the shared filter state. Update the client to render the new filter controls and preserve the existing table/pagination behavior.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/trades/filters.test.ts convex/trades.test.ts`
Expected: PASS

### Task 4: Validate end-to-end

**Files:**
- No repository file changes required unless Playwright finds a bug

**Step 1: Bootstrap the worktree**

Run:

```bash
git worktree list
cp .env.local.example .env.local
pnpm install
```

Expected: `.env.local` and `node_modules/` exist in the current worktree.

**Step 2: Start the app**

Run:

```bash
pnpm dev
npx convex dev
```

Expected: both servers start successfully and expose a usable local URL.

**Step 3: Verify in Playwright**

Use `playwright-interactive` against the detected local URL and verify:

- the date quick-filter buttons are gone
- ticker filtering works with partial input
- portfolio `No portfolio` filtering works
- account filtering uses mapped names when present
- filters combine correctly

**Step 4: Run final validation**

Run:

```bash
pnpm test src/lib/trades/filters.test.ts convex/trades.test.ts
pnpm typecheck
```

Expected: PASS
