# Bravos Deactivation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make all Bravos triggers and product discovery paths inactive while retaining the feature code and preparing a safe, uninvoked data-cleanup path.

**Architecture:** A shared server-only disabled response protects all four existing API entry points before any side effects. The legacy review route redirects to the supported imports workspace, and navigation/test contracts no longer expose Bravos. A private cleanup utility will inspect and process data in bounded batches only after an explicit production approval.

**Tech Stack:** Next.js App Router, TypeScript, Convex, Vitest, Playwright.

---

### Task 1: Protect Bravos operational routes

**Files:**
- Create: `src/lib/bravos/disabled.ts`
- Create: `src/lib/bravos/disabled.test.ts`
- Modify: `src/app/api/bravos/connect/route.ts`
- Modify: `src/app/api/bravos/fetch-post/route.ts`
- Modify: `src/app/api/bravos/save-session/route.ts`
- Modify: `src/app/api/internal/bravos/run/route.ts`

**Step 1:** Write a unit test for the shared disabled response.

**Step 2:** Return that response as the first action in each route handler.

**Step 3:** Run the focused unit test.

### Task 2: Remove product discovery and legacy review access

**Files:**
- Modify: `src/components/app-shell/app-navigation.ts`
- Modify: `src/app/(app)/imports/bravos/page.tsx`
- Modify: `shared/e2e/testIds.ts`
- Modify: `tests/e2e/smoke/app-shell.spec.ts`
- Modify: `tests/e2e/smoke/bravos-review.spec.ts`
- Modify: `tests/e2e/smoke/operational-surfaces.spec.ts`
- Modify: `tests/e2e/helpers/selectors.ts`

**Step 1:** Remove the Bravos link/test id and route expectation.

**Step 2:** Redirect the legacy page to `/imports` and convert its browser test to assert the redirect.

**Step 3:** Replace the Bravos-only filtering assertion with a supported filter combination.

### Task 3: Add a non-executable cleanup mechanism and audit production

**Files:**
- Modify: `convex/bravos.ts`
- Modify: `convex/bravos.test.ts`

**Step 1:** Add a private, bounded cleanup mutation with explicit dry-run and continuation behavior; it must not be scheduled or exposed to clients.

**Step 2:** Add unit coverage of its identification/batch behavior.

**Step 3:** Run production queries only to count Bravos plans, associated trades/notes, and unresolved review items. Do not invoke any mutation.

### Task 4: Verify and ship

**Files:**
- Modify: none expected

**Step 1:** Run lint, typecheck, unit tests, and production build.

**Step 2:** Commit implementation changes, push the branch, and open a PR against `main`.
