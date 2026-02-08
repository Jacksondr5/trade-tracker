# Campaign + Trade Plans Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace campaign-level instrument/target tracking with optional campaign-linked trade plans, and re-link trades to optional `tradePlanId` (no direct campaign linkage).

**Architecture:** Introduce a new `tradePlans` table as tactical planning records with free-form entry/exit/target condition fields. Keep campaigns as strategic thesis/retrospective containers. Migrate trade association from `campaignId` to optional `tradePlanId`, then roll campaign analytics up via trade plans.

**Tech Stack:** Next.js 15 App Router, Convex (schema + queries + mutations), TypeScript, Zod, TanStack Form, Tailwind CSS

---

## Preconditions

- Work in a dedicated git worktree/branch before implementation.
- Start Convex dev/codegen workflow before backend verification.
- This repo has no formal test framework; use fail-first type/lint/build checks plus manual UI verification.

### Task 1: Schema Foundation (Additive)

**Files:**
- Create: `convex/tradePlans.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/trades.ts`
- Regenerate: `convex/_generated/api.d.ts`, `convex/_generated/dataModel.d.ts` (via codegen)

**Step 1: Write the failing test**

Create a temporary compile reference in `convex/tradePlans.ts` that queries `tradePlans` before schema support exists.

```ts
export const _compileProbe = query({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.db.query("tradePlans").collect();
    return null;
  },
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL with table/type errors for `tradePlans`.

**Step 3: Write minimal implementation**

- Add `tradePlans` table to `convex/schema.ts` with fields:
  - `campaignId: v.optional(v.id("campaigns"))`
  - `name`, `status`, `instrumentSymbol`, `entryConditions`, `exitConditions`, `targetConditions`
  - optional metadata fields (`instrumentType`, `instrumentNotes`, `rationale`, `closedAt`, `invalidatedAt`, `sortOrder`)
- Add indexes: `by_campaignId`, `by_status`.
- In `convex/schema.ts` update `trades` table:
  - remove `campaignId`
  - add `tradePlanId: v.optional(v.id("tradePlans"))`
  - add index `by_tradePlanId` and remove `by_campaignId`.

**Step 4: Run test to verify it passes**

Run: `npx convex codegen && pnpm typecheck`
Expected: PASS (no type errors).

**Step 5: Commit**

```bash
git add convex/schema.ts convex/tradePlans.ts convex/_generated/api.d.ts convex/_generated/dataModel.d.ts convex/trades.ts
git commit -m "feat: add tradePlans schema and tradePlanId linkage"
```

### Task 2: Trade Plans Backend API

**Files:**
- Modify: `convex/tradePlans.ts`
- Modify: `convex/campaigns.ts`

**Step 1: Write the failing test**

Add a temporary call site in `convex/campaigns.ts` to a missing trade-plan query helper (e.g. `listTradePlansByCampaign`) so typecheck fails.

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL with missing export/function errors.

**Step 3: Write minimal implementation**

Implement in `convex/tradePlans.ts`:
- `createTradePlan`
- `updateTradePlan`
- `updateTradePlanStatus` with valid transitions for `idea|watching|active|closed`
- `getTradePlan`
- `listTradePlans` filterable by optional `campaignId` and optional `status`
- `listStandaloneTradePlans` (`campaignId` missing)
- `listTradePlansByCampaign`

Rules:
- `campaignId` optional, but when provided campaign must exist.
- if linked campaign is `closed`, reject reopening plan to non-`closed` status.

In `convex/campaigns.ts`, add helper query support to consume trade plans for campaign detail/rollups.

**Step 4: Run test to verify it passes**

Run: `pnpm typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/tradePlans.ts convex/campaigns.ts
git commit -m "feat: implement trade plan mutations and queries"
```

### Task 3: Trades Backend Migration (Campaign Link Removal)

**Files:**
- Modify: `convex/trades.ts`
- Modify: `convex/lib/plCalculation.ts`

**Step 1: Write the failing test**

Update `convex/trades.ts` validators to `tradePlanId` but do not yet update create/update handlers.

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL where handlers still read/write `campaignId`.

**Step 3: Write minimal implementation**

- Replace all `campaignId` args/fields with optional `tradePlanId`.
- Validate `tradePlanId` existence on create/update.
- Remove closed-campaign check from trade creation/update.
- Replace `getTradesByCampaign` with `getTradesByTradePlan` using `by_tradePlanId`.
- Update shared trade type in `convex/lib/plCalculation.ts` from `campaignId?` to `tradePlanId?`.

**Step 4: Run test to verify it passes**

Run: `pnpm typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/trades.ts convex/lib/plCalculation.ts
git commit -m "refactor: migrate trades to optional tradePlanId"
```

### Task 4: Campaign and Analytics Rollups via Trade Plans

**Files:**
- Modify: `convex/campaigns.ts`
- Modify: `convex/analytics.ts`

**Step 1: Write the failing test**

Change query signatures in `convex/campaigns.ts` to use trade-plan rollup types first, leaving old trade filtering in place.

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL for stale `trade.campaignId` accessors.

**Step 3: Write minimal implementation**

- In `convex/campaigns.ts`, for campaign PL and position status:
  - fetch linked trade plans by `campaignId`
  - collect plan IDs
  - aggregate trades where `trade.tradePlanId` in those IDs
- In `convex/analytics.ts`, replace campaign win/loss calculations based on trade-plan linkage rather than direct trade campaign ID.

**Step 4: Run test to verify it passes**

Run: `pnpm typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add convex/campaigns.ts convex/analytics.ts
git commit -m "refactor: compute campaign analytics through trade plan linkage"
```

### Task 5: Campaign Detail UI Refactor (Trade Plans)

**Files:**
- Modify: `src/app/campaigns/[id]/page.tsx`

**Step 1: Write the failing test**

Replace existing campaign detail mutation/query hooks for instruments/targets/stop-loss with `api.tradePlans.*` hooks before adding handlers/UI.

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL due to missing local state handlers/components.

**Step 3: Write minimal implementation**

- Remove instruments/entry/profit/stop-loss sections.
- Add `Trade Plans` section:
  - list plan cards with instrument and free-form conditions
  - create/edit form (name, instrument, entry/exit/target, optional rationale)
  - status controls per plan
- Keep thesis, notes, retrospective, status modal behavior intact.
- Update campaign page trade table source to plan-derived display (or show all trades with linked plans belonging to campaign).

**Step 4: Run test to verify it passes**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/campaigns/[id]/page.tsx
git commit -m "feat: replace campaign tactical sections with trade plans UI"
```

### Task 6: Standalone Trade Plans Page

**Files:**
- Create: `src/app/trade-plans/page.tsx`
- Modify: `src/components/Header.tsx`

**Step 1: Write the failing test**

Add nav link to `/trade-plans` in `src/components/Header.tsx` before page exists.

**Step 2: Run test to verify it fails**

Run: `pnpm build`
Expected: FAIL due to missing route page.

**Step 3: Write minimal implementation**

Create `/trade-plans` page with:
- filters: status + linkage mode (`standalone`, `linked`, `all`)
- list cards and creation flow for standalone plans (`campaignId` unset)
- optional inline reassignment to campaign

**Step 4: Run test to verify it passes**

Run: `pnpm build`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/trade-plans/page.tsx src/components/Header.tsx
git commit -m "feat: add standalone trade plans management page"
```

### Task 7: Trade Form and Trade List Re-linking

**Files:**
- Modify: `src/app/trades/new/page.tsx`
- Modify: `src/app/trades/page.tsx`
- Modify: `src/app/campaigns/[id]/page.tsx` (remove `?campaignId=` deep-linking)

**Step 1: Write the failing test**

Change form schema in `src/app/trades/new/page.tsx` from `campaignId` to `tradePlanId` without updating submit mapping.

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL on createTrade args mismatch.

**Step 3: Write minimal implementation**

- New trade form uses optional trade-plan selector (`No trade plan` option).
- Read optional `tradePlanId` query param for preselection.
- Trade list replaces campaign column with trade-plan column.
- Build plan name lookup map from `api.tradePlans.listTradePlans`.

**Step 4: Run test to verify it passes**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/trades/new/page.tsx src/app/trades/page.tsx src/app/campaigns/[id]/page.tsx
git commit -m "refactor: link trades to trade plans in UI"
```

### Task 8: Data Migration Script (Legacy Campaign Arrays -> Trade Plans)

**Files:**
- Create: `scripts/migrate-campaign-fields-to-trade-plans.mjs`
- Modify: `convex/tradePlans.ts` (optional internal migration mutation helpers)
- Modify: `docs/plans/2026-02-08-campaign-trade-plan-redesign.md` (migration notes + rollback)

**Step 1: Write the failing test**

Run migration script before implementation.

Run: `node scripts/migrate-campaign-fields-to-trade-plans.mjs`
Expected: FAIL (`file not found`).

**Step 2: Run test to verify it fails**

Confirm non-zero exit code.

**Step 3: Write minimal implementation**

Implement script to:
- for each campaign, map each instrument into a trade plan
- append legacy target/stop-loss notes into `targetConditions`/`exitConditions` text blocks
- preserve `campaignId` linkage on created plans
- avoid duplicate migrations with idempotency marker (e.g. plan name prefix or metadata field)

**Step 4: Run test to verify it passes**

Run: `node scripts/migrate-campaign-fields-to-trade-plans.mjs --dry-run`
Expected: PASS with summary counts and zero writes.

Run: `node scripts/migrate-campaign-fields-to-trade-plans.mjs`
Expected: PASS with created/updated counts.

**Step 5: Commit**

```bash
git add scripts/migrate-campaign-fields-to-trade-plans.mjs docs/plans/2026-02-08-campaign-trade-plan-redesign.md convex/tradePlans.ts
git commit -m "chore: add migration script for campaign tactical data"
```

### Task 9: Legacy Removal and Final Cleanup

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/campaigns.ts`
- Modify: `src/app/campaigns/[id]/page.tsx`
- Modify: `src/app/trades/new/page.tsx`
- Modify: `src/app/trades/page.tsx`
- Modify: `convex/analytics.ts`
- Modify: `CLAUDE.md`

**Step 1: Write the failing test**

Remove legacy campaign array fields from schema before removing all usage.

**Step 2: Run test to verify it fails**

Run: `pnpm typecheck`
Expected: FAIL on stale `instruments`, `entryTargets`, `profitTargets`, `stopLossHistory` references.

**Step 3: Write minimal implementation**

- Delete deprecated campaign tactical mutations and UI state.
- Remove remaining stale references to legacy fields.
- Update architecture docs in `CLAUDE.md` to describe campaign/trade-plan separation.

**Step 4: Run test to verify it passes**

Run:
- `npx convex codegen`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Expected: all PASS.

**Step 5: Commit**

```bash
git add convex/schema.ts convex/campaigns.ts src/app/campaigns/[id]/page.tsx src/app/trades/new/page.tsx src/app/trades/page.tsx convex/analytics.ts CLAUDE.md convex/_generated/api.d.ts convex/_generated/dataModel.d.ts
git commit -m "refactor: remove legacy campaign tactical model"
```

### Task 10: Verification Checklist and Release Notes

**Files:**
- Modify: `README.md`
- Create: `docs/plans/2026-02-08-campaign-trade-plan-rollout-checklist.md`

**Step 1: Write the failing test**

Attempt final verification before checklist exists.

Run: `cat docs/plans/2026-02-08-campaign-trade-plan-rollout-checklist.md`
Expected: FAIL (`No such file or directory`).

**Step 2: Run test to verify it fails**

Confirm file absence.

**Step 3: Write minimal implementation**

Document:
- migration order
- production dry-run/run commands
- rollback strategy
- post-deploy manual checks (campaign detail, standalone plans, trade create/list, analytics)

**Step 4: Run test to verify it passes**

Run full verification one more time:
- `npx convex codegen`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Expected: all PASS and rollout checklist present.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-02-08-campaign-trade-plan-rollout-checklist.md
git commit -m "docs: add rollout checklist for trade plan migration"
```

## Manual QA Scenarios (must pass)

1. Create standalone trade plan, then create a trade linked to it.
2. Create campaign, add two linked trade plans, move statuses across lifecycle.
3. Close campaign while one plan remains open: warning appears, close still possible.
4. Reopen linked trade plan after campaign close: blocked with clear error.
5. Create unlinked trade (no tradePlanId): succeeds and appears in trade list.
6. Campaign detail shows linked plans and no legacy instruments/targets/stop-loss sections.
7. Campaign P&L equals sum of trades linked through campaign’s trade plans.
8. Analytics endpoint returns expected counts without referencing `trade.campaignId`.

## Risks and Mitigations

- Risk: mixed old/new records during migration.
  - Mitigation: additive schema first, idempotent migration script, cleanup only after verification.
- Risk: analytics regressions due to rollup path changes.
  - Mitigation: explicit manual QA scenario for campaign and dashboard totals.
- Risk: user confusion with new workflow.
  - Mitigation: update labels/help text in campaign detail and trade form.
