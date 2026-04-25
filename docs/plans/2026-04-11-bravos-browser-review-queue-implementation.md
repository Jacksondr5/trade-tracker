# Bravos Browser Review Queue Implementation Plan

**Goal:** Replace the current manual Bravos paste-based import path with a Browserbase-backed Bravos review workflow that supports scheduled scans, manual re-scans, and explicit approval before canonical mutations.

**Architecture:** Add dedicated Convex records for Bravos connections, review items, and sync runs; keep `/imports/bravos` as a separate operational workspace from brokerage imports; and use a protected internal Next.js worker route for Browserbase capture, page processing, and AI-heavy extraction. Convex remains the source of truth for workflow state, dedupe, review approval, authorization, and canonical trade-plan or note mutations. Convex dispatches worker processing by scheduling an internal action that performs the side-effecting `fetch` to the protected worker route.

**Tech Stack:** Next.js App Router, protected Route Handlers, Convex queries/mutations/crons, Browserbase remote browser sessions, Clerk auth, Vitest, Playwright.

**Delivery Strategy:** Build a vertical manual direct-post fetch first. Add listing scans, cron, dashboard entry points, and legacy-dialog removal only after direct-post capture, extraction, review, and approval work end to end.

**MVP 1 Scope:** Tasks 1-5 are the first implementation slice. They should prove direct post fetch, worker dispatch, review item creation, extraction, and approval from `/imports/bravos`. Tasks 6-9 should wait until that path works end to end.

**Worker Invocation Contract:**

- Public/client entry points verify the signed-in user and create Convex workflow state.
- Convex mutations create `bravosSyncRuns` records and schedule an internal dispatch action with `ctx.scheduler.runAfter(0, ...)`.
- The internal dispatch action performs the external HTTP side effect: `POST /api/internal/bravos/run`.
- The internal worker route validates `Authorization: Bearer ${BRAVOS_WORKER_SECRET}`.
- The dispatch request body is `{ "syncRunId": "..." }`.
- `BRAVOS_WORKER_SECRET` must be configured in Vercel for route validation and in Convex for dispatch signing.
- Convex also needs a worker route URL env var, for example `BRAVOS_WORKER_URL`.
- Scheduled actions are not automatically retried by Convex, so failed dispatch or worker failures must be reflected on `bravosSyncRuns` and recoverable through retry.

**Client Route Contract:**

Use a separate client-facing route when a Bravos action needs Next.js server capabilities, such as creating a Browserbase Live View login session.

- Client routes must be guarded with Clerk auth.
- Client routes may create or request Convex workflow state.
- Client routes must not call the internal worker route directly before Convex has created a sync run.
- Client routes must not mutate canonical trade plans or notes directly.

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

it("uses the source post date for follow-up field update prefixes", async () => {
  // approve a follow-up review item with a source date and assert appended
  // trade-plan field text uses that date rather than fetch or run creation time
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
  - `requestSpecificBravosPostFetch`
- internal actions for:
  - dispatching a sync run to the protected worker route
- internal mutations for:
  - loading a pending run for worker processing
  - marking a sync run as queued, processing, done, or error
  - upserting a connection
  - upserting a review item by canonical identity
  - writing sync-run state
  - transitioning review state after extraction/matching
  - applying follow-up proposals using the review item's source post date for appended field prefixes

Keep approval logic explicit:

- `create_trade_plan`
- `apply_follow_up`
- `note_only`
- `dismiss`

Do not reuse `importTasks` as the primary record.
Do not date follow-up field updates from sync-run creation, review-item creation, fetch, or processing time.

For this task, `requestSpecificBravosPostFetch` should create a sync run or job record and schedule the internal dispatch action. The dispatch action may be a minimal stub until the protected worker route exists.

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: PASS for dedupe, in-place refresh, and approval-boundary tests.

**Step 5: Commit**

```bash
git add convex/bravos.ts convex/bravos.test.ts
git commit -m "feat: add Bravos review queue backend"
```

### Task 3: Add Browserbase worker route and scraper contract for direct post fetch

**Files:**
- Create: `src/app/api/internal/bravos/run/route.ts`
- Create: `src/app/api/bravos/connect/route.ts`
- Create: `src/app/api/bravos/fetch-post/route.ts`
- Create: `src/lib/bravos/browserbase.ts`
- Create: `src/lib/bravos/scraper.ts`
- Create: `src/lib/bravos/scraper.test.ts`
- Modify: `package.json`
- Modify: `src/env.ts`
- Test: `src/lib/bravos/scraper.test.ts`

**Step 1: Write the failing tests**

Add `src/lib/bravos/scraper.test.ts` covering:

```ts
import { describe, expect, it } from "vitest";
import { extractBravosListingPosts, extractBravosPostPayload } from "./scraper";

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

  it("extracts the post source date when it is present", () => {
    const result = extractBravosPostPayload("<html>...</html>");
    expect(result.sourcePostDate).toBe("2026-04-10");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/bravos/scraper.test.ts`

Expected: FAIL because the scraper contract does not exist.

**Step 3: Write the minimal implementation**

- Add Browserbase server env vars to `src/env.ts`:
  - `BROWSERBASE_API_KEY`
  - any required project/session config vars
- Add an internal worker secret env var to `src/env.ts`, such as `BRAVOS_WORKER_SECRET`
- Add the same worker secret and a worker route URL env var to the Convex deployment environment so Convex can dispatch the worker route.
- Add Browserbase/Playwright dependencies, preferring `@browserbasehq/sdk` and `playwright-core` unless runtime constraints require direct Browserbase HTTP API calls.
- Create `src/lib/bravos/browserbase.ts` as the thin Browserbase client wrapper for:
  - creating a session with a saved context
  - creating a login Live View session
  - opening a post page
  - persisting/using `contextId`
- Create `src/lib/bravos/scraper.ts` with pure functions for:
  - extracting post references from listing content
  - extracting raw text, image URLs, source post dates or published timestamps, and source ids from post content
- Create `src/app/api/internal/bravos/run/route.ts` as the protected worker endpoint for a direct post fetch job:
  - validate `BRAVOS_WORKER_SECRET`
  - accept a bounded job identifier such as `syncRunId`
  - load job details from Convex
  - perform Browserbase capture and AI extraction
  - include the extracted source post date in the review item payload and follow-up proposal
  - write normalized results back through explicit Convex mutations
- Create client-facing Bravos routes only for user-triggered server work:
  - `/api/bravos/connect` creates or resumes a Browserbase Live View login session after Clerk auth
  - `/api/bravos/fetch-post` verifies Clerk auth and creates the Convex direct-post fetch request
  - neither route bypasses Convex review state or canonical approval mutations

Keep scraper parsing pure so most tests run against fixtures rather than live Bravos pages.
Do not put durable workflow state in the route handler.

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/bravos/scraper.test.ts`

Expected: PASS for fixture-driven listing and detail parsing.

**Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/env.ts src/app/api/internal/bravos/run/route.ts src/app/api/bravos/connect/route.ts src/app/api/bravos/fetch-post/route.ts src/lib/bravos/browserbase.ts src/lib/bravos/scraper.ts src/lib/bravos/scraper.test.ts
git commit -m "feat: add Bravos Browserbase worker contract"
```

### Task 4: Wire direct post fetch orchestration

**Files:**
- Modify: `convex/bravos.ts`
- Modify: `src/app/api/internal/bravos/run/route.ts`
- Modify: `src/app/api/bravos/fetch-post/route.ts`
- Test: `convex/bravos.test.ts`

**Step 1: Write the failing tests**

Add or extend `convex/bravos.test.ts` with cases for:

```ts
it("creates a direct post fetch run without mutating canonical data", async () => {
  // request a specific post and assert a run record is written
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: FAIL because scheduled/manual orchestration does not exist yet.

**Step 3: Write the minimal implementation**

- Wire `requestSpecificBravosPostFetch` in `convex/bravos.ts` to create a sync run with `kind: "direct_post_fetch"` and the requested source URL.
- Schedule the internal dispatch action from the mutation with `ctx.scheduler.runAfter(0, ...)` after creating the sync run.
- Implement the dispatch action so it calls `BRAVOS_WORKER_URL` with `Authorization: Bearer ${BRAVOS_WORKER_SECRET}` and `{ syncRunId }`.
- Add internal/public mutation helpers the worker route needs to:
  - load a pending run
  - mark a run processing/done/error
  - upsert the fetched review item by canonical identity
  - transition review item state after extraction and matching
  - reject or flag follow-up proposals whose source post date is unavailable instead of silently falling back to processing time
- Have the internal worker route process only direct post fetch runs in this task.
- Make direct post fetch update an existing review item in place when present.
- Have `/api/bravos/fetch-post` call the authenticated Convex mutation instead of calling `/api/internal/bravos/run` directly.

Keep the action flow:

1. start sync run
2. Convex schedules internal dispatch action with `runAfter(0)`
3. dispatch action posts `syncRunId` to protected worker route
4. worker captures from Browserbase
5. worker runs extraction/matching
6. worker writes normalized result through Convex
7. Convex upserts review items and finalizes run state

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- convex/bravos.test.ts`

Expected: PASS for sync-run creation and shared orchestration behavior.

**Step 5: Commit**

```bash
git add convex/bravos.ts src/app/api/internal/bravos/run/route.ts src/app/api/bravos/fetch-post/route.ts convex/bravos.test.ts
git commit -m "feat: wire Bravos direct post fetch orchestration"
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

### Task 6: Add listing scan and scheduled sync orchestration

**Files:**
- Modify: `convex/bravos.ts`
- Create: `convex/crons.ts`
- Modify: `src/app/api/internal/bravos/run/route.ts`
- Create: `src/app/api/bravos/run-scan/route.ts`
- Modify: `src/lib/bravos/scraper.ts`
- Modify: `src/lib/bravos/scraper.test.ts`
- Test: `convex/bravos.test.ts`

**Step 1: Write the failing tests**

Add or extend coverage for:

```ts
it("creates listing scan runs that use the shared review-item upsert path", async () => {
  // request a listing scan and assert run state is written
});

it("scheduled sync creates a listing scan run without approving review items", async () => {
  // assert cron-triggered orchestration only creates operational/review state
});
```

Extend scraper fixture tests so listing markup returns source URLs, source ids when present, and published timestamps when present.

**Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/lib/bravos/scraper.test.ts convex/bravos.test.ts`

Expected: FAIL until listing extraction and scan-run orchestration exist.

**Step 3: Write the minimal implementation**

- Add `requestManualBravosScan` to `convex/bravos.ts`.
- Add a cron entry in `convex/crons.ts` for the daily Bravos sync.
- Keep cron work lightweight: call an internal mutation that creates a sync run and schedules the internal dispatch action rather than doing Browserbase work in Convex.
- Create `/api/bravos/run-scan` as a Clerk-guarded client-facing route that calls the authenticated Convex manual scan mutation; it must not call `/api/internal/bravos/run` directly.
- Extend the protected worker route to process `listing_scan` runs:
  - open the configured listing URL with Browserbase
  - extract post references from listing markup
  - skip already-known canonical identities for scheduled scans
  - fetch/process new post URLs through the same direct-post capture path
  - mark individual post failures without necessarily failing the whole listing run
- Keep manual listing scans and scheduled scans on the same dedupe path.

**Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/lib/bravos/scraper.test.ts convex/bravos.test.ts`

Expected: PASS for listing parsing, run creation, and dedupe behavior.

**Step 5: Commit**

```bash
git add convex/bravos.ts convex/crons.ts src/app/api/internal/bravos/run/route.ts src/app/api/bravos/run-scan/route.ts src/lib/bravos/scraper.ts src/lib/bravos/scraper.test.ts convex/bravos.test.ts
git commit -m "feat: add Bravos listing scan orchestration"
```

### Task 7: Add manual Bravos controls and remove the old paste-based path

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

### Task 8: Add dashboard Bravos sync status and actions

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

### Task 9: Harden approval flow, regression tests, and docs

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
pnpm test -- src/lib/bravos/source-identity.test.ts src/lib/bravos/scraper.test.ts convex/bravos.test.ts
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
