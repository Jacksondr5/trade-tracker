# Bravos Trades Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dedicated Bravos navigation category and index filter for service-sourced trade plans.

**Architecture:** Derive a Bravos category from `tradePlans.sourceUrl` in shared Convex payloads, then render that category consistently in the local hierarchy, breadcrumbs, command palette metadata, and the trade-plans index. Keep the detail route and underlying schema unchanged.

**Tech Stack:** Next.js App Router, Convex, React, Vitest

---

## Task 1: Extend shared trade-plan category contracts

**Files:**

- Modify: `convex/navigation.ts`
- Modify: `convex/tradePlans.ts`
- Modify: `src/lib/campaign-trade-plan-navigation.ts`
- Test: `convex/navigation.test.ts`
- Test: `convex/tradePlans.test.ts`
- Test: `src/lib/campaign-trade-plan-navigation.test.ts`

**Steps:**

1. Add a derived Bravos category for trade plans with `sourceUrl`.
2. Return Bravos trade plans in a dedicated navigation bucket and relationship kind.
3. Update shared labels and breadcrumb helpers to understand Bravos placement.
4. Extend unit tests to cover Bravos categorization and breadcrumb output.

## Task 2: Render the Bravos group in navigation surfaces

**Files:**

- Modify: `src/components/app-shell/campaign-trade-plan-hierarchy-state.ts`
- Modify: `src/components/app-shell/campaign-trade-plan-hierarchy.tsx`
- Modify: `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`
- Modify: `src/components/app-shell/command-palette.ts`
- Test: `src/components/app-shell/campaign-trade-plan-hierarchy.test.ts`
- Test: `src/components/app-shell/command-palette.test.ts`

**Steps:**

1. Add persisted expansion support for the Bravos rail group.
2. Render Bravos trade plans in their own local hierarchy section.
3. Keep command-palette trade-plan search working while labeling Bravos context correctly.
4. Extend component tests for the new group and context labels.

## Task 3: Add a Bravos filter to the trade-plans index

**Files:**

- Modify: `src/app/(app)/trade-plans/TradePlansPageClient.tsx`
- Modify: `shared/e2e/testIds.ts`
- Test: `convex/tradePlans.test.ts`

**Steps:**

1. Add a `Bravos` relationship filter that uses the derived summary relationship kind.
2. Keep all summary stats unchanged and only change filtered list behavior.
3. Add the new stable test id for the filter button.
4. Verify trade-plan summary tests cover Bravos relationships.

## Task 4: Validate the change set

**Files:**

- No code changes required.

**Steps:**

1. Run targeted Vitest coverage for navigation, hierarchy helpers, command palette, and trade-plan summaries.
2. Run repo-level `pnpm typecheck`.
3. Run repo-level `pnpm lint`.
