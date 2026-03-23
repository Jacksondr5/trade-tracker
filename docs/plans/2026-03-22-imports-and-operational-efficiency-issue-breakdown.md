# Imports And Operational Efficiency Issue Breakdown

**Goal:** Break the `Imports And Operational Efficiency` project into a reviewable set of larger, cohesive Linear issues before implementation starts.

**Primary product-doc sources:** `docs/product/roadmap.md`, `docs/product/feature-philosophy.md`, `docs/product/information-architecture.md`, `docs/product/ux-principles.md`, `docs/product/glossary.md`, `docs/product/content-and-copy-principles.md`, `docs/product/visual-design-system.md`

**Current implementation anchors:** `src/app/(app)/imports/page.tsx`, `src/app/(app)/imports/ImportsPageClient.tsx`, `src/app/(app)/imports/components/inbox-table.tsx`, `src/app/(app)/imports/components/upload-section.tsx`, `src/app/(app)/imports/components/edit-trade-form.tsx`, `src/app/(app)/imports/hooks/use-import-upload.ts`, `convex/imports.ts`, `src/app/(app)/trades/TradesPageClient.tsx`, `convex/trades.ts`, `src/app/(app)/trade-plans/TradePlansPageClient.tsx`, `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`, `convex/tradePlans.ts`, `convex/lib/statuses.ts`, `src/components/app-shell/ImportTaskTray.tsx`, `src/components/ui/select.tsx`, `src/components/ui/field-select.tsx`, `src/components/ui/button.tsx`

---

## Scope For This Project

This project covers the roadmap work needed to make import review and nearby operational surfaces faster, clearer, and more maintainable during normal weekly use.

Included:

- Import flow UX refinement for brokerage CSV review and acceptance
- Explicit separation of lifecycle status, focus/watch language, and import-review state on touched operational surfaces
- Shared-primitives cleanup for dense operational controls where route-local patterns are still dominant
- Loading, skeleton, and empty-state improvements on touched data-heavy operational routes
- Copy and visual-system cleanup on touched operational surfaces

Explicitly out of scope:

- Campaign workspace redesign beyond small touched-status or copy adjustments
- Trade-plan workspace redesign beyond import-related operational affordances already on the page
- Notes workflow redesign
- Strategy workflow redesign
- Dashboard or analytics expansion
- Portfolio model changes
- Any new generalized search, matching, or AI system outside the import-review workflow already in scope

## Current State Summary

The `Imports` route still behaves like an early functional workflow rather than the denser review workspace described by the product docs. `src/app/(app)/imports/page.tsx` preloads five separate queries and `src/app/(app)/imports/ImportsPageClient.tsx` stitches the route together client-side. The page title remains `Import Trades`, the upload area and inbox are separate ad hoc modules, and the inbox table in `src/app/(app)/imports/components/inbox-table.tsx` relies heavily on raw `<select>`, `<input>`, and icon-button rows for assignment, quick-create, portfolio selection, notes, and accept/edit/delete actions.

The backend import logic in `convex/imports.ts` is functional but narrow. Brokerage CSV rows become `Inbox Trades` with `pending_review` status, validation errors and warnings, and simple exact-ticker auto-match against open trade plans. The route can accept rows one-by-one or via `acceptAllTrades`, but the frontend still carries a meaningful amount of route-local persistence, optimistic rollback, and aggregate error messaging logic.

The surrounding operational surfaces are uneven. `src/app/(app)/trade-plans/TradePlansPageClient.tsx` already exposes pending-import counts and has a route-level `loading.tsx`, while `src/app/(app)/trades/TradesPageClient.tsx` still uses raw filter selects and has no route-level loading shell. `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx` includes import-follow-up affordances and raw status/relationship selects. `src/components/app-shell/ImportTaskTray.tsx` introduces a second import-related operational surface with its own task-state UI and overlapping import terminology. The project needs to tighten these touched routes without reopening the broader campaign, trade-plan, or notes redesign work.

## Cross-Project Dependency Assumptions

This project sits after the navigation and main workspace redesigns.

Strong assumptions already satisfied by completed work:

- `JAC-113`, `JAC-114`, `JAC-116`, `JAC-117`, `JAC-118`, `JAC-121`, and `JAC-122` already established the authenticated shell, canonical `Imports` navigation label, hierarchy data layer, and general touched-surface cleanup rules
- `JAC-123` through `JAC-130` already reshaped campaign workspace behavior, so this project should not take over campaign-page composition
- `JAC-145`, `JAC-146`, `JAC-147`, `JAC-148`, `JAC-149`, and `JAC-151` already reshaped trade-plan list/detail surfaces and introduced service-post imports, so this project should only touch trade-plan surfaces where import review or operational status semantics require it
- `JAC-139` through `JAC-143` already own notes, strategy, and retrospective primitives; this project should not absorb evidence-capture redesign

Implementation assumption:

- The import project can rely on the current shell, hierarchy, and trade-plan workspace contracts already in the repo rather than treating them as future blockers

## Recommended Linear Issue Set

### 1. Imports Operational Contract And Data Foundation

**Purpose**

Create one shared foundation for the project by locking scope, operational vocabulary, and the imports review data contract in the same ticket.

**Scope**

- Translate the evergreen product docs and current project brief into an implementation-ready contract
- Define exactly which operational surfaces this project owns: `Imports`, `Trades` filters/table/loading states, import-task UI, and import-related trade-plan affordances
- Define what remains in adjacent projects instead of this one
- Define the vocabulary matrix for:
  - lifecycle status
  - watch/focus state
  - import-review state
  - match state
- Build a dedicated imports review query or query layer that returns the data the route actually needs in one coherent shape
- Make import row state more explicit in the returned payload, including readiness, validation state, and match context
- Keep auto-match behavior understandable and reviewable instead of making it more opaque
- Reuse existing trade-plan and portfolio data where appropriate instead of duplicating unrelated workspace logic
- Add focused backend tests for the imports review payload and edge cases

**Deliverables**

- Short implementation contract in `docs/plans/`
- Finalized touched-route matrix and operational vocabulary matrix
- Stable Convex data contract for the imports workspace
- Reduced frontend route-local stitching in `ImportsPageClient`
- Tests covering validation, matching, and acceptance-relevant edge cases

**Likely touch points**

- `docs/plans/`
- `convex/imports.ts`
- `convex/tradePlans.ts`
- `shared/imports/auto-match.ts`
- existing import-related tests under `src/lib/imports/` and `convex/`

**Notes**

This is intentionally larger than the earlier draft. The contract and the data layer are tightly coupled, and separating them would mostly force the same owner to reopen the same decisions twice.

### 2. Imports Review Workspace And Workflow Overhaul

**Purpose**

Give one implementation owner the full user-facing imports experience: page composition, row review workflow, bulk actions, and the import-specific semantics that need to be clear during review.

**Scope**

- Recompose the page header, upload controls, inbox summary, and review queue into one coherent operational workspace
- Make match state, validation state, and row readiness obvious at a glance
- Keep row actions visible and cheap during repeated review work
- Improve the bulk-actions area so the user can understand pending count and next actions quickly
- Improve the trade-plan assignment flow in the inbox rows
- Improve the quick-create trade-plan flow from imports while keeping it intentionally minimal
- Tighten inline portfolio and notes handling where it materially reduces review friction
- Improve `Accept all` behavior, messaging, and guardrails so the user can understand what was accepted, what still needs review, and why
- Apply the glossary distinction between lifecycle, watch/focus, and import-review state on touched imports-facing surfaces
- Standardize the use of `Pending Review` for inbox trades and avoid vague generic `pending` wording where it hides meaning
- Keep automation legible and correctable

**Deliverables**

- Rebuilt `Imports` page layout
- Lower-friction row-level review workflow
- Cleaner quick-create path for missing trade plans
- More trustworthy bulk-review feedback
- Imports-facing semantics and copy that make review state clearer

**Likely touch points**

- `src/app/(app)/imports/page.tsx`
- `src/app/(app)/imports/ImportsPageClient.tsx`
- `src/app/(app)/imports/components/inbox-table.tsx`
- `src/app/(app)/imports/components/upload-section.tsx`
- `src/app/(app)/imports/components/edit-trade-form.tsx`
- `src/app/(app)/imports/hooks/use-inline-inbox-edits.ts`
- `src/app/(app)/imports/utils.ts`
- `src/app/(app)/imports/types.ts`
- `convex/imports.ts`
- `convex/tradePlans.ts`

**Notes**

Keep quick-create scoped to the minimum trade-plan creation needed during imports. Do not reopen the full trade-plan creation or relationship-management experience already covered by `JAC-147` and `JAC-148`.

### 3. Operational Surface Systemization, Loading States, And Hardening

**Purpose**

Leave the touched operational routes in a materially stronger system state after the imports overhaul lands.

**Scope**

- Replace raw route-local selects, inline buttons, and similar dense controls where a shared primitive should own the pattern
- Extend the shared UI layer only where the operational routes actually need it
- Align touched imports controls, trades filters, and any touched trade-plan operational controls with the shared form and button system
- Add route-level loading treatment where operational routes still fall back to plain text or abrupt layout shifts
- Add table or row skeletons that match the final structure of imports and trades
- Improve empty and filtered-empty states using the operational copy rules from the product docs
- Clarify how trade-plan `watching` relates to `Watchlist` on touched operational surfaces outside the main imports route
- Align touched status badges, labels, helper text, and small metadata treatments with the copy and visual-system docs
- Final visual-system cleanup pass across touched imports, trades, import-task UI, and import-related trade-plan surfaces
- Remove obvious route-local styling debt left behind by earlier implementation issues
- Add focused regression coverage for the main operational paths touched in this project

**Deliverables**

- Operational surfaces using shared primitives instead of ad hoc control markup where practical
- Better loading shells for touched operational routes
- Improved empty and filtered-empty states
- Touched operational surfaces aligned with the current visual and copy system
- Focused regression coverage for import review and touched loading/filter states

**Likely touch points**

- `src/components/ui/select.tsx`
- `src/components/ui/field-select.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/submit-button.tsx`
- `src/app/(app)/imports/loading.tsx`
- `src/app/(app)/trades/loading.tsx`
- `src/app/(app)/imports/components/inbox-table.tsx`
- `src/app/(app)/imports/components/upload-section.tsx`
- `src/app/(app)/trades/TradesPageClient.tsx`
- `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- `src/app/(app)/trade-plans/TradePlansPageClient.tsx`
- `src/components/app-shell/ImportTaskTray.tsx`
- relevant unit, backend, and end-to-end tests under `tests/e2e/`, `src/lib/`, and `convex/`

**Notes**

This issue should not become a whole-app primitive migration or a generalized UI cleanup pass. It owns only the operational surfaces touched by this project.

## Recommended Issue Order

1. Imports Operational Contract And Data Foundation
2. Imports Review Workspace And Workflow Overhaul
3. Operational Surface Systemization, Loading States, And Hardening

## Explicit Dependency Map

### Issue 1. Imports Operational Contract And Data Foundation

**Blocks**

- Issue 2
- Issue 3

**Why**

The rest of the project depends on a settled touched-surface list, vocabulary matrix, and imports review payload before the user-facing overhaul and systemization work fan out.

### Issue 2. Imports Review Workspace And Workflow Overhaul

**Blocked by**

- Issue 1

**Blocks**

- Issue 3

**Why**

The systemization and loading-state pass should reflect the final imports workspace structure and workflow instead of landing against the current route-local version and being reworked later.

### Issue 3. Operational Surface Systemization, Loading States, And Hardening

**Blocked by**

- Issue 1

**Strongly prefers after**

- Issue 2

**Blocks**

- project completion

**Why**

Some primitives or loading-state work could begin earlier, but the final pass should happen after the imports workspace and workflow decisions are visible in near-final form.

## Cross-Project Blocking Candidates For Linear

Most hard cross-project dependencies appear to be already satisfied by completed tickets, so I would expect mainly soft references rather than live blockers when these issues are created.

Most relevant candidates:

- `JAC-145` if the imports foundation reuses or extends trade-plan pending-review rollups instead of reimplementing similar logic in parallel
- `JAC-148` if touched trade-plan detail import affordances need cleanup while standardizing operational status language
- `JAC-149` and `JAC-151` if the project decides to unify wording or task-state treatment across brokerage CSV imports and service-post imports
- `JAC-130` and `JAC-143` as prior-art references for the expected cleanup and regression-coverage bar on touched surfaces

Recommended dependency posture when the tickets are created:

- treat `JAC-145`, `JAC-148`, `JAC-149`, and `JAC-151` as soft reference dependencies unless implementation uncovers a real missing contract
- avoid adding campaign or notes tickets as blockers unless this project drifts into their already-completed surface ownership, which it should not

## Open Risk Areas

- The largest overlap risk is between imports throughput work and trade-plan workspace ownership. Quick-create, pending-review metadata, and detail-page import affordances should stay operational and import-centered instead of turning into more trade-plan redesign.
- The second overlap risk is between status-language cleanup and a larger lifecycle-model rethink. This project should standardize wording and presentation on touched operational surfaces, not change the underlying status model.
- There is a mild risk that the shared-primitives and hardening issue grows into a general UI-system cleanup. It should stay constrained to `Imports`, `Trades`, and any directly touched trade-plan import controls.
