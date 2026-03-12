# Campaign Filter Pending State Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the jarring loading flash on the campaigns index by preserving the prior result set during filter changes and showing lighter pending feedback instead.

**Architecture:** Keep the selected filter state as the source of truth for the query, cache the last resolved result set locally, and render that cached data while the next filter query is pending. Add an outline-spark pending treatment to the selected button and a subtle updating treatment to the table container.

**Tech Stack:** Next.js App Router, React, Convex React hooks, Tailwind CSS v4, shared UI button and card primitives

---

### Task 1: Save the approved design

**Files:**
- Create: `docs/plans/2026-03-11-campaign-filter-pending-state-design.md`
- Create: `docs/plans/2026-03-11-campaign-filter-pending-state-implementation.md`

**Step 1: Save the design doc**

Record the approved continuity-first filter behavior and the combined pending-state treatment.

**Step 2: Save the implementation plan**

Capture the constrained code and verification steps before editing the page.

### Task 2: Implement the pending-state transition

**Files:**
- Modify: `src/app/(app)/campaigns/CampaignsPageClient.tsx`

**Step 1: Preserve the last resolved campaign set**

Track the last resolved filter result locally so the page can keep rendering rows while the new filter query is still pending.

**Step 2: Add pending button feedback**

Show the selected pending filter button with a softer selected treatment and an animated border sweep that does not change the button layout.

**Step 3: Add table updating feedback**

Keep the current rows visible, slightly reduce contrast, and render a compact “Updating campaigns…” indicator while the new query resolves.

**Step 4: Keep the empty state post-resolution only**

Only show the empty state once the next query has resolved to zero campaigns.

### Task 3: Verify the interaction

**Files:**
- Modify only if verification exposes issues

**Step 1: Run lint**

Run: `pnpm lint`

**Step 2: Run typecheck**

Run: `pnpm typecheck`

**Step 3: Spot-check filter transitions**

Use Playwright to switch between campaign filters on `/campaigns` and confirm the table no longer flashes to the loading card on fast responses.
