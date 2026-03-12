# Navigation Visual-System Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the navigation project cleanup by consolidating shell navigation states and controls onto shared patterns, then align the campaigns and trade-plans index pages with the approved visual system.

**Architecture:** Add one small shared navigation-state component inside the app-shell layer, reuse shared `Button` and `Alert` primitives for shell-owned controls, and keep page cleanup limited to the campaign and trade-plan index surfaces. Avoid pulling campaign and trade-plan detail editors into this ticket.

**Tech Stack:** Next.js App Router, React, Convex, Tailwind CSS v4, shared UI primitives in `src/components/ui`

---

### Task 1: Save the approved scope

**Files:**

- Create: `docs/plans/2026-03-11-navigation-visual-system-cleanup-design.md`
- Create: `docs/plans/2026-03-11-navigation-visual-system-cleanup-implementation.md`

**Step 1: Save the design doc**

Capture the approved shell-and-index boundary, the shared nav-state decision, and the explicit detail-page exclusions.

**Step 2: Save the implementation plan**

Record the constrained task breakdown before touching code.

### Task 2: Add shared app-shell navigation states

**Files:**

- Create: `src/components/app-shell/NavigationState.tsx`
- Modify: `src/components/app-shell/index.ts`
- Modify: `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`
- Modify: `src/components/app-shell/AppShell.tsx`
- Modify: `src/components/app-shell/CommandPalette.tsx`

**Step 1: Add a lightweight shared nav-state component**

Support loading and empty variants with app-shell token classes.

**Step 2: Replace repeated hierarchy loading and empty blocks**

Use the shared component in the desktop rail and mobile drawer.

**Step 3: Update command palette status handling**

Render a clearer loading and empty treatment without introducing a second filtering system.

### Task 3: Move shell controls onto shared primitives

**Files:**

- Modify: `src/components/app-shell/AppShell.tsx`
- Modify: `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`

**Step 1: Convert the mobile drawer trigger to the shared button primitive**

Keep the current layout and accessibility labels.

**Step 2: Normalize hierarchy toggle controls**

Reuse shared button styling for group toggles and campaign expanders instead of one-off classes.

**Step 3: Replace ad hoc watchlist error markup**

Use the shared `Alert` primitive for watch-action failures.

### Task 4: Clean up the campaigns index page

**Files:**

- Modify: `src/app/(app)/campaigns/CampaignsPageClient.tsx`

**Step 1: Replace the raw status select**

Use the shared field select component or another existing shared form primitive.

**Step 2: Align page surfaces with the visual system**

Move page shell, empty state, and dense table surfaces onto the approved olive/slate mapping.

**Step 3: Keep existing navigation behavior intact**

Preserve row navigation and status filtering behavior.

### Task 5: Clean up the trade-plans index page

**Files:**

- Modify: `src/app/(app)/trade-plans/TradePlansPageClient.tsx`

**Step 1: Update page shells to the approved token system**

Replace old `slate-*` shell cards with olive working surfaces and keep dense list elements deliberate.

**Step 2: Preserve current shared form usage**

Do not expand scope into new route-level primitives where the page already uses shared inputs and buttons.

### Task 6: Validate the cleanup

**Files:**

- Modify only if validation exposes issues

**Step 1: Bootstrap the worktree**

Copy `.env.local` from the primary checkout and run `pnpm install` because this worktree is missing both.

**Step 2: Run tests**

Run: `pnpm test -- src/components/app-shell/campaign-trade-plan-hierarchy.test.ts src/components/app-shell/command-palette.test.ts`

**Step 3: Run lint and typecheck**

Run: `pnpm lint`

Run: `pnpm typecheck`

**Step 4: Spot-check the touched routes**

Verify `/campaigns` and `/trade-plans` after the shell changes render with the expected navigation states and token mapping.
