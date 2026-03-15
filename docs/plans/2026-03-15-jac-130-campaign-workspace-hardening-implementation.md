# Campaign Workspace Hardening Implementation Plan

> **For implementers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace residual route-local campaign UI controls with shared primitives and add regression coverage for the campaign workspace list/detail flows.

**Architecture:** Extend the shared UI layer with the missing select/watch affordances instead of leaving campaign detail-specific implementations in route code. Keep data behavior deterministic by expanding the existing Playwright seed and cover the resulting list/detail paths with focused Convex and Playwright tests.

**Tech Stack:** Next.js App Router, Convex, TanStack React Form, Vitest, Playwright

---

## Task 1: Document The Approved Scope

**Files:**

- Create: `docs/plans/2026-03-15-jac-130-campaign-workspace-hardening-design.md`
- Create: `docs/plans/2026-03-15-jac-130-campaign-workspace-hardening-implementation.md`

**Step 1: Save the approved design**

Write the short design note that captures the scope boundary, shared-primitive cleanup, and regression strategy for JAC-130.

**Step 2: Save the implementation plan**

Write this task-by-task implementation handoff so the execution work stays constrained to the approved scope.

**Step 3: Verify the docs exist**

Run: `ls docs/plans | grep '2026-03-15-jac-130-campaign-workspace-hardening'`
Expected: both new plan files are listed

## Task 2: Bootstrap The Worktree

**Files:**

- Modify: `.env.local` (copied from the primary checkout if missing)
- Modify: `node_modules/` (installed if missing)

**Step 1: Locate the primary checkout**

Run: `git worktree list`
Expected: one entry identifies the main checkout path

**Step 2: Copy the local env file only if `.env.local` is missing**

Run: `test -f .env.local || cp <main-checkout>/.env.local .env.local`
Expected: `.env.local` exists in this worktree

**Step 3: Install dependencies if needed**

Run: `pnpm install`
Expected: `node_modules/` is created without install errors

## Task 3: Add The Shared Select Cleanup

**Files:**

- Modify: `src/components/ui/field-select.tsx`
- Modify: `src/components/ui/index.ts`
- Modify: `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`

**Step 1: Write the failing regression test**

Add or update a test that depends on the campaign detail status selectors exposing stable shared test ids or behavior through the shared field component.

**Step 2: Extend the shared select primitive**

Update `FieldSelect` so it uses the same olive/slate token system as the shared input components and can expose stable test ids and disabled/help text behavior needed by the campaign detail page.

**Step 3: Replace route-local campaign detail selects**

Swap the raw campaign status and linked trade-plan status `<select>` controls for the shared select primitive or a shared wrapper built from it.

**Step 4: Run the targeted tests**

Run: `pnpm test convex/campaigns.test.ts`
Expected: campaign workspace tests pass

## Task 4: Unify The Watch Toggle And Touched Copy

**Files:**

- Modify: `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`
- Modify: `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`
- Modify: `src/app/(app)/campaigns/CampaignsPageClient.tsx`

**Step 1: Extract or reuse the shared watch-button pattern**

Move the detail page watch toggle onto the same shared button styling and labeling contract used by the hierarchy rail.

**Step 2: Align touched copy**

Update touched campaign copy so button labels and helper text follow the product copy rules. Keep the change set limited to the list/detail surfaces touched by this ticket.

**Step 3: Run the targeted tests**

Run: `pnpm test convex/campaigns.test.ts`
Expected: campaign workspace tests still pass

## Task 5: Extend Deterministic Regression Coverage

**Files:**

- Modify: `shared/e2e/smokeFixtures.ts`
- Modify: `convex/e2eSeed.ts`
- Modify: `tests/e2e/helpers/selectors.ts`
- Modify: `tests/e2e/smoke/campaigns.spec.ts`
- Modify: `convex/campaigns.test.ts`

**Step 1: Write the failing browser regression**

Add Playwright assertions for campaign lifecycle filtering and clear-filter recovery on `/campaigns`, then verify the current seed cannot satisfy them.

**Step 2: Extend deterministic seed data**

Add one planning campaign and one closed campaign fixture so the smoke suite can cover list filtering without ad hoc runtime setup.

**Step 3: Strengthen Convex coverage**

Add or extend campaign workspace tests to assert lifecycle-filter ordering and summary rollups for the seeded-style scenarios this ticket now depends on.

**Step 4: Run the targeted tests**

Run: `pnpm test convex/campaigns.test.ts`
Expected: PASS

Run: `pnpm test:e2e --grep campaigns`
Expected: PASS

## Task 6: Final Validation

**Files:**

- Modify: none

**Step 1: Run lint**

Run: `pnpm lint`
Expected: PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Summarize the results**

Capture the files changed, validations run, and any residual risks before handing the ticket back to the user.
