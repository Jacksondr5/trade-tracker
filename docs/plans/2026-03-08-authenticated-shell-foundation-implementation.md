# Authenticated Shell Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the shared authenticated app shell foundation with grouped desktop and mobile global navigation, and normalize the portfolios route naming.

**Architecture:** Move signed-in routes under an `(app)` layout that wraps `AuthGate` and a reusable shell component. Drive desktop and mobile navigation from one shared config, reuse the existing dialog primitive for the unified mobile drawer, and rename the portfolios route to match the product copy contract.

**Tech Stack:** Next.js App Router, React, Clerk, Convex, Tailwind CSS v4, existing shared UI primitives

---

### Task 1: Document the shell contract locally

**Files:**
- Create: `docs/plans/2026-03-08-authenticated-shell-foundation-design.md`
- Create: `docs/plans/2026-03-08-authenticated-shell-foundation-implementation.md`

**Step 1: Save the approved design**

Write the approved shell-boundary, shared-nav, and route-normalization decisions into the design doc.

**Step 2: Save the implementation plan**

Write the high-level task breakdown for the shell refactor and verification steps.

### Task 2: Split public auth pages from the app shell

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/(app)/layout.tsx`
- Move or recreate: `src/app/(public)/sign-in/[[...sign-in]]/page.tsx`
- Move or recreate: `src/app/(public)/sign-up/[[...sign-up]]/page.tsx`

**Step 1: Remove the old global header from the root layout**

Keep providers and global body styling in the root layout only.

**Step 2: Add the app-shell layout**

Wrap `(app)` routes with `AuthGate` and the new shell component.

**Step 3: Place auth pages in the public group**

Ensure `/sign-in` and `/sign-up` render without authenticated chrome.

### Task 3: Build the shared shell and nav config

**Files:**
- Create: `src/components/app-shell/AppShell.tsx`
- Create: `src/components/app-shell/app-navigation.ts`
- Create: `src/components/app-shell/index.ts`
- Delete: `src/components/Header.tsx`

**Step 1: Create the shared global nav config**

Define grouped sections, labels, hrefs, and active-match prefixes from one source of truth.

**Step 2: Build the shell renderer**

Render the desktop sidebar, mobile top bar, and unified mobile drawer from the shared config.

**Step 3: Preserve auth controls**

Keep Clerk user controls visible in the shell without restoring the old top-nav pattern.

### Task 4: Normalize the portfolios route

**Files:**
- Move or recreate: `src/app/(app)/portfolios/**`
- Create optional redirects: `src/app/(app)/portfolio/page.tsx`, `src/app/(app)/portfolio/[id]/page.tsx`
- Modify internal links that still point to `/portfolio`

**Step 1: Rename the route path**

Serve the portfolios pages from `/portfolios`.

**Step 2: Update internal navigation and back-links**

Point shell nav and portfolio detail flows at `/portfolios`.

**Step 3: Add lightweight redirects if needed**

Keep old `/portfolio` links from breaking during the transition.

### Task 5: Verify the shell foundation

**Files:**
- Modify only if verification reveals issues

**Step 1: Run lint**

Run: `pnpm lint`

**Step 2: Run typecheck**

Run: `pnpm typecheck`

**Step 3: Spot-check key routes**

Verify the shell and route behavior on `/`, `/sign-in`, `/campaigns`, and `/portfolios`.
