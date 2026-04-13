# Bravos Browser Review Queue Implementation Plan

**Goal:** Replace the current manual Bravos paste-based import path with a Browserbase-backed Bravos review workflow that supports scheduled scans, manual re-scans, and explicit approval before canonical mutations.

**Architecture:** Add dedicated Convex records for Bravos connections, review items, and sync runs; drive scheduled and manual ingestion through one Browserbase-backed scraper pipeline; keep `/imports/bravos` as a separate operational workspace from brokerage imports. Treat Browserbase capture as the source-ingestion layer and keep extraction, match suggestion, and approval mutations inside app-owned Convex modules.

**Tech Stack:** Next.js App Router, Convex queries/mutations/actions/crons, Browserbase remote browser sessions, Clerk auth, Vitest, Playwright.

---

### Task 1: Add Bravos schema and source-identity helpers

**Files:**
- Create: `src/lib/bravos/source-identity.ts`
- Create: `src/lib/bravos/source-identity.test.ts`
- Modify: `convex/schema.ts`
- Test: `src/lib/bravos/source-identity.test.ts`
- Test: `convex/bravos.test.ts`

**Step 1: Write the failing tests**

Add `src/lib/bravos/source-identity.test.ts` covering:

```ts
import { describe, expect, it } from "vitest";
import {
  buildBravosSourceIdentity,
  normalizeBravosSourceUrl,
} from "./source-identity";

describe("normalizeBravosSourceUrl", () => {
  it("normalizes tracking params and hashes", () => {
    expect(
      normalizeBravosSourceUrl(
        "https://example.com/post/123?utm_source=x#comments",
      ),
    ).toBe("https://example.com/post/123");
  });
});

describe("buildBravosSourceIdentity", () => {
  it("prefers explicit post id when present", () => {
    expect(
      buildBravosSourceIdentity({
        sourcePostId: "post_123",
        sourceUrl: "https://example.com/post/123",
      }),
    ).toBe("post_123");
  });
});
```

Add a placeholder `convex/bravos.test.ts` case asserting the schema-facing helpers can support dedupe by canonical identity.

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/bravos/source-identity.test.ts convex/bravos.test.ts`

Expected: FAIL because the new helper module and Bravos schema-backed code do not exist yet.

**Step 3: Write the minimal implementation**

- Add `src/lib/bravos/source-identity.ts` with:
  - `normalizeBravosSourceUrl(url: string): string`
  - `buildBravosSourceIdentity(args: { sourcePostId?: string | null; sourceUrl: string }): string`
- Extend `convex/schema.ts` with new tables:
  - `bravosConnections`
  - `bravosReviewItems`
  - `bravosSyncRuns`
- Add only the minimum indexed fields needed for:
  - owner lookup
  - connection lookup
  - review-item lookup by canonical source identity
  - queue/state filtering

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/bravos/source-identity.test.ts convex/bravos.test.ts`

Expected: PASS for the helper tests, with schema compilation succeeding.

**Step 5: Commit**

```bash
git add src/lib/bravos/source-identity.ts src/lib/bravos/source-identity.test.ts convex/schema.ts convex/bravos.test.ts
git commit -m "feat: add Bravos review schema foundations"
```

### Task 2: Add Bravos backend module for connection, queue, and approval state

**Files:**
- Create: `convex/bravos.ts`
- Create: `convex/bravos.test.ts`
- Modify: `convex/_generated/api.d.ts`
- Test: `convex/bravos.test.ts`

**Step 1: Write the failing tests**

Expand `convex/bravos.test.ts` with cases for:

```ts
it("creates one review item per canonical Bravos source identity", async () => {
  // ingest the same source twice and expect one record
});

it("updates an existing review item in place on manual refetch", async () => {
  // existing item should keep identity and refresh fetched fields
});

it("does not mutate trade plans until approval", async () => {
  // create review item, then assert no trade plan changes before approval
});

it("marks the connection as needs_reconnect when auth fails", async () => {
  // simulate auth failure transition
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: FAIL because `convex/bravos.ts` and its query/mutation surface do not exist yet.

**Step 3: Write the minimal implementation**

Create `convex/bravos.ts` with:

- public queries for:
  - `getBravosConnection`
  - `listBravosReviewItems`
  - `getBravosReviewItem`
- public mutations for:
  - `saveBravosListingUrl`
  - `markBravosConnectionNeedsReconnect`
  - `approveBravosReviewItem`
  - `dismissBravosReviewItem`
  - `requestManualBravosScan`
  - `requestSpecificBravosPostFetch`
- internal mutations for:
  - upserting a connection
  - upserting a review item by canonical identity
  - writing sync-run state
  - transitioning review state after extraction/matching

Keep approval logic explicit:

- `create_trade_plan`
- `apply_follow_up`
- `note_only`
- `dismiss`

Do not reuse `importTasks` as the primary record.

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: PASS for dedupe, in-place refresh, and approval-boundary tests.

**Step 5: Commit**

```bash
git add convex/bravos.ts convex/bravos.test.ts
git commit -m "feat: add Bravos review queue backend"
```

### Task 3: Add Browserbase integration and scraper contract

**Files:**
- Create: `convex/lib/bravosBrowser.ts`
- Create: `convex/lib/bravosScraper.ts`
- Create: `convex/lib/bravosScraper.test.ts`
- Modify: `src/env.ts`
- Test: `convex/lib/bravosScraper.test.ts`

**Step 1: Write the failing tests**

Add `convex/lib/bravosScraper.test.ts` covering:

```ts
import { describe, expect, it } from "vitest";
import { extractBravosListingPosts, extractBravosPostPayload } from "./bravosScraper";

describe("extractBravosListingPosts", () => {
  it("returns post links and timestamps from listing markup", () => {
    const result = extractBravosListingPosts("<html>...</html>");
    expect(result).toEqual([
      expect.objectContaining({ sourceUrl: "https://example.com/post/1" }),
    ]);
  });
});

describe("extractBravosPostPayload", () => {
  it("returns normalized text and image urls for a post page", () => {
    const result = extractBravosPostPayload("<html>...</html>");
    expect(result.rawText.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- convex/lib/bravosScraper.test.ts`

Expected: FAIL because the scraper contract does not exist.

**Step 3: Write the minimal implementation**

- Add Browserbase server env vars to `src/env.ts`:
  - `BROWSERBASE_API_KEY`
  - any required project/session config vars
- Create `convex/lib/bravosBrowser.ts` as the thin Browserbase client wrapper for:
  - creating a session
  - opening a listing page
  - opening a post page
  - persisting/using `contextId`
- Create `convex/lib/bravosScraper.ts` with pure functions for:
  - extracting post references from listing content
  - extracting raw text, image URLs, timestamps, and source ids from post content

Keep scraper parsing pure so most tests run against fixtures rather than live Bravos pages.

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- convex/lib/bravosScraper.test.ts`

Expected: PASS for fixture-driven listing and detail parsing.

**Step 5: Commit**

```bash
git add src/env.ts convex/lib/bravosBrowser.ts convex/lib/bravosScraper.ts convex/lib/bravosScraper.test.ts
git commit -m "feat: add Browserbase Bravos scraper contract"
```

### Task 4: Add Convex actions and cron orchestration for scheduled and manual scans

**Files:**
- Create: `convex/bravosActions.ts`
- Create: `convex/crons.ts`
- Modify: `convex/bravos.ts`
- Test: `convex/bravos.test.ts`

**Step 1: Write the failing tests**

Add or extend `convex/bravos.test.ts` with cases for:

```ts
it("creates sync runs for scheduled scans", async () => {
  // assert a run record is written and queued
});

it("uses the same ingestion path for manual scans and specific post fetches", async () => {
  // both requests should write run state and review items through shared helpers
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: FAIL because scheduled/manual orchestration does not exist yet.

**Step 3: Write the minimal implementation**

- Create `convex/bravosActions.ts` with internal actions for:
  - scheduled listing crawl
  - manual listing crawl
  - direct post fetch
  - extraction/match processing after capture
- Create `convex/crons.ts` to schedule the daily Bravos sync
- Wire public mutations in `convex/bravos.ts` to enqueue the internal actions
- Make scheduled scans skip known identities
- Make direct post fetch update an existing review item in place when present

Keep the action flow:

1. start sync run
2. capture from Browserbase
3. upsert review items
4. run extraction/matching
5. finalize run state

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: PASS for sync-run creation and shared orchestration behavior.

**Step 5: Commit**

```bash
git add convex/bravos.ts convex/bravosActions.ts convex/crons.ts convex/bravos.test.ts
git commit -m "feat: add Bravos scan orchestration"
```

### Task 5: Build the `/imports/bravos` route and queue data loading

**Files:**
- Create: `src/app/(app)/imports/bravos/page.tsx`
- Create: `src/app/(app)/imports/bravos/BravosReviewPageClient.tsx`
- Create: `src/app/(app)/imports/bravos/loading.tsx`
- Create: `src/app/(app)/imports/bravos/components/bravos-review-list.tsx`
- Create: `src/app/(app)/imports/bravos/components/bravos-review-detail.tsx`
- Modify: `shared/e2e/testIds.ts`
- Test: `tests/e2e/smoke/bravos-review.spec.ts`

**Step 1: Write the failing tests**

Add `tests/e2e/smoke/bravos-review.spec.ts` with a narrow app-owned smoke case:

```ts
test("Bravos review route renders connection state and pending items", async ({ page }) => {
  await page.goto("/imports/bravos");
  await waitForAuthenticatedApp(page, "bravos-review-page-title");
  await expect(page.getByTestId("bravos-sync-card")).toBeVisible();
});
```

Add matching test ids in `shared/e2e/testIds.ts` before implementation.

**Step 2: Run tests to verify they fail**

Run: `pnpm test:e2e -- tests/e2e/smoke/bravos-review.spec.ts`

Expected: FAIL because the route and selectors do not exist yet.

**Step 3: Write the minimal implementation**

- Create `/imports/bravos` route using `preloadQuery` against:
  - connection query
  - review queue query
  - summary counts if needed
- Add a minimal client workspace with:
  - page title
  - queue summary
  - list of review items
  - review-item detail panel or inline detail section
- Add stable `data-testid` hooks for the route and queue actions

Do not overdesign visuals in this task. Keep layout functional and testable.

**Step 4: Run tests to verify they pass**

Run: `pnpm test:e2e -- tests/e2e/smoke/bravos-review.spec.ts`

Expected: PASS for the route shell and queue rendering.

**Step 5: Commit**

```bash
git add src/app/(app)/imports/bravos/page.tsx src/app/(app)/imports/bravos/BravosReviewPageClient.tsx src/app/(app)/imports/bravos/loading.tsx src/app/(app)/imports/bravos/components/bravos-review-list.tsx src/app/(app)/imports/bravos/components/bravos-review-detail.tsx shared/e2e/testIds.ts tests/e2e/smoke/bravos-review.spec.ts
git commit -m "feat: add Bravos review route"
```

### Task 6: Add manual Bravos controls and remove the old paste-based path

**Files:**
- Modify: `src/app/(app)/trade-plans/TradePlansPageClient.tsx`
- Modify: `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- Modify: `src/app/(app)/imports/components/inbox-table.tsx`
- Delete: `src/app/(app)/trade-plans/ImportPostDialog.tsx`
- Delete: `src/lib/import-orchestrator.ts`
- Modify: `src/components/app-shell/ImportTaskTray.tsx`
- Test: `tests/e2e/smoke/bravos-review.spec.ts`

**Step 1: Write the failing tests**

Add or extend smoke coverage to assert:

```ts
test("manual Bravos actions route users into the browser-based review flow", async ({ page }) => {
  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);
  await page.getByTestId("trade-plans-import-from-service-button").click();
  await expect(page).toHaveURL(/\/imports\/bravos$/);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test:e2e -- tests/e2e/smoke/bravos-review.spec.ts`

Expected: FAIL because the old dialog is still wired and the route handoff does not exist.

**Step 3: Write the minimal implementation**

- Remove `ImportPostDialog` usage from:
  - trade plans index
  - trade plan detail page
  - imports inbox table
- Replace those entry points with links or actions into `/imports/bravos`
- Remove `src/app/(app)/trade-plans/ImportPostDialog.tsx`
- Remove `src/lib/import-orchestrator.ts`
- Rework `ImportTaskTray` only if needed so Bravos work no longer depends on the legacy task model

Keep brokerage imports untouched.

**Step 4: Run tests to verify they pass**

Run: `pnpm test:e2e -- tests/e2e/smoke/bravos-review.spec.ts`

Expected: PASS with the old paste dialog removed from the Bravos entry path.

**Step 5: Commit**

```bash
git add src/app/(app)/trade-plans/TradePlansPageClient.tsx src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx src/app/(app)/imports/components/inbox-table.tsx src/components/app-shell/ImportTaskTray.tsx
git rm src/app/(app)/trade-plans/ImportPostDialog.tsx src/lib/import-orchestrator.ts
git commit -m "refactor: replace legacy Bravos import dialog"
```

### Task 7: Add dashboard Bravos sync status and actions

**Files:**
- Modify: `convex/analytics.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `shared/e2e/testIds.ts`
- Test: `tests/e2e/smoke/bravos-review.spec.ts`
- Test: `tests/e2e/smoke/app-shell.spec.ts`

**Step 1: Write the failing tests**

Add assertions for:

```ts
test("dashboard shows the Bravos sync card", async ({ page }) => {
  await page.goto("/dashboard");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.dashboard);
  await expect(page.getByTestId("dashboard-bravos-sync-card")).toBeVisible();
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test:e2e -- tests/e2e/smoke/app-shell.spec.ts tests/e2e/smoke/bravos-review.spec.ts`

Expected: FAIL because dashboard stats and actions do not include Bravos sync state.

**Step 3: Write the minimal implementation**

- Extend `convex/analytics.ts` or a dedicated Bravos summary query to return:
  - connection status
  - pending review count
  - last sync metadata
- Update `src/app/(app)/dashboard/page.tsx` with a functional Bravos sync card
- Add stable actions:
  - `Connect Bravos` / `Reconnect Bravos`
  - `Run scan now`
  - `Fetch specific post`
  - `Open review queue`

Keep the card operational, not visual-polish-heavy.

**Step 4: Run tests to verify they pass**

Run: `pnpm test:e2e -- tests/e2e/smoke/app-shell.spec.ts tests/e2e/smoke/bravos-review.spec.ts`

Expected: PASS for the dashboard card and review-route entry point.

**Step 5: Commit**

```bash
git add convex/analytics.ts src/app/(app)/dashboard/page.tsx shared/e2e/testIds.ts tests/e2e/smoke/app-shell.spec.ts tests/e2e/smoke/bravos-review.spec.ts
git commit -m "feat: add dashboard Bravos sync status"
```

### Task 8: Harden approval flow, regression tests, and docs

**Files:**
- Modify: `convex/bravos.test.ts`
- Modify: `tests/e2e/smoke/bravos-review.spec.ts`
- Modify: `docs/plans/2026-04-11-bravos-browser-review-queue-design.md`
- Modify: `README.md`

**Step 1: Write the failing tests**

Add backend and smoke coverage for:

```ts
it("prevents duplicate approval from applying twice", async () => {
  // second approval attempt should no-op or error cleanly
});

test("approving a Bravos review item applies the chosen action once", async ({ page }) => {
  // approve one ready item and verify the queue state changes
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- convex/bravos.test.ts && pnpm test:e2e -- tests/e2e/smoke/bravos-review.spec.ts`

Expected: FAIL until approval guards and final workflow wiring are complete.

**Step 3: Write the minimal implementation**

- Add idempotency guards for approval mutations
- Tighten any missing queue-state transitions
- Update the design doc only if implementation changed a material contract
- Add a short README note describing the Bravos review workflow and its separation from brokerage imports

**Step 4: Run the validation suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test -- src/lib/bravos/source-identity.test.ts convex/lib/bravosScraper.test.ts convex/bravos.test.ts
pnpm test:e2e -- tests/e2e/smoke/app-shell.spec.ts tests/e2e/smoke/bravos-review.spec.ts
```

Expected: All commands PASS.

**Step 5: Commit**

```bash
git add convex/bravos.test.ts tests/e2e/smoke/bravos-review.spec.ts docs/plans/2026-04-11-bravos-browser-review-queue-design.md README.md
git commit -m "test: harden Bravos review workflow"
```

## Notes For Execution

- Use `playwright-interactive` first for app-owned UI verification in this repo.
- Keep Bravos DOM extraction isolated in pure scraper helpers where possible so page-shape drift can be tested with fixtures.
- Do not mix Bravos review rows into the brokerage imports table.
- Do not reintroduce paste-based Bravos ingestion once the browser workflow is wired.
- If Browserbase credential/bootstrap details force a different env or secret-loading path than `src/env.ts`, document that divergence before implementation continues.
