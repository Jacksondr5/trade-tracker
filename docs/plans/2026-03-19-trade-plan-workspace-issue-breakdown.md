# Trade Plan Workspace Issue Breakdown

**Goal:** Break the `Trade Plan Workspace` project into a reviewable set of Linear issues before creating tickets.

**Primary product-doc sources:** `docs/product/roadmap.md`, `docs/product/feature-philosophy.md`, `docs/product/information-architecture.md`, `docs/product/ux-principles.md`, `docs/product/glossary.md`, `docs/product/navigation-model.md`, `docs/product/technical-architecture-overview.md`

**Current implementation anchors:** `src/app/(app)/trade-plans/layout.tsx`, `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`, `src/app/(app)/trade-plans/TradePlansPageClient.tsx`, `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`, `src/app/(app)/trade-plans/[id]/page.tsx`, `convex/tradePlans.ts`, `convex/schema.ts`, `convex/imports.ts`, `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`, `tests/e2e/smoke/trade-plans.spec.ts`

---

## Scope For This Project

This project covers the Phase 2 trade-plan-specific work needed to make trade plans a true tactical working surface rather than a thin detail page plus a standalone-only list.

Included:

- Trade-plan list/index redesign as a first-class workspace entry point
- Trade-plan detail information architecture refresh
- Exposure of the richer trade-plan structure already implied by the product docs and current schema
- Better handling of standalone trade plans versus campaign-linked trade plans, including relationship management on the trade-plan surface
- Better trade and pending-import context on the trade-plan page
- Keeping campaign context, tactical plan context, notes context, and execution context legible together on touched trade-plan surfaces
- Shared UI, form, copy, and visual-system cleanup on touched trade-plan surfaces

Explicitly out of scope:

- Global shell, local hierarchy rail, breadcrumbs, watchlist model, and command palette behavior from `Navigation, Shell, And Working Context`
- Campaign list/detail redesign already handled by `Campaign Workspace`
- Shared notes system redesign, evidence UX redesign, or strategy editor redesign
- Global imports workflow redesign, inbox-table redesign, or generalized import throughput work
- Trade-detail redesign or broader analytics/dashboard work
- Reinterpreting the core object model away from `Campaign -> Trade Plan -> Trade`

## Current State Summary

The navigation foundations this project depends on already exist. `src/app/(app)/trade-plans/layout.tsx` routes trade-plan pages through `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`, so hierarchy rail, mobile breadcrumbs, watchlist integration, and command-palette groundwork are already part of the shell.

The trade-plan domain surface itself is still thin. `src/app/(app)/trade-plans/TradePlansPageClient.tsx` currently functions as a create form plus a standalone-plan list. Linked trade plans are intentionally pushed into campaign detail and local hierarchy navigation, which means the `Trade Plans` route is not yet a true domain workspace.

The trade-plan detail page in `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx` currently exposes only:

- relationship label and campaign link when present
- editable name
- editable instrument symbol
- lifecycle status select
- shared notes section
- a basic trades table with inline pending-inbox acceptance

The backend model is ahead of the UI. `convex/schema.ts` and `convex/tradePlans.ts` already define fields for `rationale`, `entryConditions`, `targetConditions`, `exitConditions`, `instrumentNotes`, `instrumentType`, `invalidatedAt`, and `sortOrder`, but the main trade-plan UI does not surface them yet.

The current backend also contains a guard in `convex/tradePlans.ts` that blocks reopening or activating a linked trade plan when its parent campaign is closed. This breakdown assumes that guard should be removed as part of the trade-plan workspace effort so campaign closure does not overconstrain tactical work.

Adjacent surfaces already touch trade plans in ways this project must respect:

- `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx` owns the current campaign-linked plan section, inline linked-plan creation, and linked-plan status changes.
- `src/app/(app)/imports/ImportsPageClient.tsx` can quick-create a trade plan while processing inbox trades.
- `convex/imports.ts` already provides `listInboxTradesForTradePlan` and `acceptTrade`, which the trade-plan detail page consumes directly.

## Cross-Project Dependency Assumptions

Hard assumptions:

- `Navigation, Shell, And Working Context` remains the owner of hierarchy shell behavior. This project should build inside that shell rather than reopen sidebar, breadcrumb, watchlist, or command-palette scope.
- `Campaign Workspace` remains the owner of campaign detail composition. Trade-plan work may require narrow campaign follow-ups for consistency, but it should not reopen campaign-page layout or strategic-summary design.
- Closed campaign status should not block linked trade-plan lifecycle changes or relationship changes. This project should remove that guard rather than extending it.

Soft assumptions:

- `Notes, Strategy, And Retrospective Workflow` owns shared notes/evidence interaction design. Trade-plan tickets may reposition or frame notes on the trade-plan page, but should avoid forking or redesigning `src/components/notes/*`.
- `Imports And Operational Efficiency` owns generalized inbox management patterns. Trade-plan tickets may improve the trade-plan page’s local execution context, but should avoid turning trade-plan work into an imports redesign.

In Linear, I would expect several trade-plan tickets to depend on completed navigation work, coordinate lightly with the notes project, and only create new cross-project blockers if relationship-management or pending-import UX reveals gaps in adjacent projects.

## Recommended Linear Issue Set

### 1. Define the trade-plan workspace implementation contract

**Purpose**

Lock the project boundaries, detail-page composition, and ownership splits before the work fans out into data, index, tactical-editor, relationship-management, and execution-context tickets.

**Scope**

- Translate the trade-plan parts of the product docs and current Linear project brief into an implementation-ready contract
- Define what this project owns versus what remains in `Campaign Workspace`, `Notes, Strategy, And Retrospective Workflow`, and `Imports And Operational Efficiency`
- Define the intended role of the trade-plan index versus campaign detail versus local hierarchy navigation
- Define the target top-level trade-plan detail composition before section-specific tickets land
- Define the minimum relationship-management behavior this phase should support for standalone and linked plans

**Deliverables**

- Short implementation contract in `docs/plans/`
- Finalized section ownership for trade-plan index/detail work
- Finalized dependency guidance for downstream trade-plan issues
- Updates to the downstream issue descriptions if the agreed trade-plan data shape or field set changes during this ticket

**Notes**

This should be a real Linear issue, not hidden prep. The rest of the ticket set should implement against it.

Before finalizing the contract, the implementation agent should review the proposed field set, detail-page composition, and relationship-management assumptions with the user rather than locking those decisions unilaterally.

Acceptance criteria for this ticket should explicitly require updating the follow-up tickets when contract or data-shape decisions change, so downstream issues stay implementation-ready.

### 2. Build the trade-plan workspace data contract

**Purpose**

Provide stable backend-facing contracts for both the trade-plan index and the redesigned trade-plan detail page.

**Scope**

- Add workspace-ready queries and derived payloads for trade-plan list and trade-plan detail surfaces
- Include the relationship, lifecycle, watch-state, and execution rollups needed for the redesigned UI
- Reduce the current detail-page reliance on stitching many small queries together in the route layer
- Preserve ownership in `convex/tradePlans.ts` unless logic genuinely belongs in another existing domain module
- Add focused tests for workspace query behavior and edge cases such as standalone plans, linked plans, closed plans, and plans with pending inbox matches

**Deliverables**

- Stable trade-plan workspace query shape for index and/or detail
- Stable detail-page payload that can support richer tactical sections without repeated ad hoc query growth
- Tests covering derived summaries and relationship edge cases

**Likely touch points**

- `convex/tradePlans.ts`
- `convex/schema.ts`
- `src/app/(app)/trade-plans/page.tsx`
- `src/app/(app)/trade-plans/[id]/page.tsx`
- targeted Convex tests

**Notes**

Do not turn this into a generic analytics layer. Keep the derived data tightly aligned to trade-plan workspace needs.

### 3. Redesign the trade-plans index as a first-class tactical workspace entry point

**Purpose**

Make `/trade-plans` useful for reorientation, prioritization, and plan management rather than functioning mainly as a standalone-create form plus standalone-only list.

**Scope**

- Redesign the trade-plan index layout and information density
- Surface both standalone and linked trade plans without making campaign detail the only place where linked plans are visible
- Improve scanability across lifecycle state, relationship state, and recent execution context
- Keep quick creation available, but subordinate it to the workspace role of the page
- Improve empty, loading, and first-use states on the trade-plan index

**Deliverables**

- Redesigned trade-plan index page
- Better list/group/filter treatment for linked and standalone plans
- Improved empty and loading states

**Likely touch points**

- `src/app/(app)/trade-plans/TradePlansPageClient.tsx`
- `src/app/(app)/trade-plans/page.tsx`
- new shared trade-plan workspace components under `src/components/`
- `tests/e2e/smoke/trade-plans.spec.ts`

**Notes**

Do not reopen local hierarchy design from the navigation project. This issue owns the trade-plan page content, not the surrounding shell.

### 4. Rebuild the trade-plan detail workspace

**Purpose**

Give a single implementation owner the full trade-plan detail surface: page composition, tactical plan fields, and execution context.

**Scope**

- Redesign the trade-plan detail header and page-level summary composition
- Improve visibility of plan name, instrument, lifecycle state, relationship state, parent campaign context, and page-level actions
- Add page-level watch/focus treatment if the workspace data contract supports it
- Reorder the major detail-page sections so the tactical plan reads as a coherent working surface
- Surface and edit `rationale`, `entryConditions`, `targetConditions`, `exitConditions`, and `instrumentNotes`
- Decide whether `instrumentType` and `invalidatedAt` belong in the main tactical section or a closely related lifecycle sub-section
- Move the touched editing flows onto the shared form system where practical instead of continuing with route-local raw inputs
- Redesign the trade/execution section on trade-plan detail
- Improve summary context for linked trades and pending inbox matches
- Clarify the distinction between assigned pending trades and symbol-suggested pending trades
- Preserve local actions that are already valuable on the page, such as accepting pending inbox trades into the linked plan
- Keep notes visible in the page flow without redesigning the shared notes system itself

**Deliverables**

- New trade-plan detail header and summary area
- Clearer page-level information architecture for the trade-plan detail route
- Structured tactical editor/read view on trade-plan detail
- Better execution-context section on trade-plan detail
- Backend mutation/query support for the newly surfaced fields if current backend shapes are too narrow
- Focused validation and tests for new tactical fields and execution-context behavior

**Likely touch points**

- `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- `src/app/(app)/trade-plans/[id]/page.tsx`
- `src/components/WatchToggleButton.tsx`
- `convex/tradePlans.ts`
- `convex/imports.ts`
- `convex/trades.ts`
- `convex/schema.ts`
- shared UI/form components under `src/components/ui/`
- shared e2e test-id helpers if new controls are introduced
- targeted frontend, e2e, and Convex tests

**Notes**

Do not redesign `src/components/notes/*` here. This issue owns trade-plan page composition and local notes placement only. Do not turn this into a strategy editor, a full trade-management initiative, or an imports workflow redesign.

### 5. Add trade-plan relationship management for standalone and linked workflows

**Purpose**

Make standalone-versus-linked behavior intentional and editable from the trade-plan surface instead of relying on one-way creation flows and implied hierarchy state.

**Scope**

- Allow a standalone trade plan to be linked to a campaign
- Allow a linked trade plan to move between campaigns
- Allow a linked trade plan to become standalone when appropriate
- Allow relationship changes even when the target campaign is closed, unless a separate data-integrity constraint appears during implementation
- Keep relationship state obvious on both the trade-plan index and detail surfaces
- Limit campaign-page changes to narrow consistency updates if they are required

**Deliverables**

- Relationship-management UI on the trade-plan surface
- Backend mutation support for reparenting/unlinking behavior, including removal of the current closed-campaign lifecycle guard
- Consistent standalone-versus-linked presentation across touched trade-plan surfaces

**Likely touch points**

- `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- `src/app/(app)/trade-plans/TradePlansPageClient.tsx`
- `convex/tradePlans.ts`
- possibly narrow consistency touches in `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`

**Notes**

Do not reopen campaign detail as a primary editing surface for this project. Any campaign-page work should be strictly limited to compatibility or consistency. Closed campaigns should remain contextual history, not permission gates.

## Recommended Issue Order

1. Define the trade-plan workspace implementation contract.
2. Build the trade-plan workspace data contract.
3. Redesign the trade-plans index as a first-class tactical workspace entry point.
4. Rebuild the trade-plan detail workspace.
5. Add trade-plan relationship management for standalone and linked workflows.

Recommended sequencing notes:

- Issues 1 and 2 are the strongest prerequisites. They reduce churn everywhere else.
- Issue 3 can land before the full detail redesign once the data contract is stable.
- Issue 4 now intentionally gives one implementation owner the full detail-page outcome, reducing handoff churn across header, tactical fields, and execution context.
- Issue 5 should follow the core detail composition and data contract so reparenting/unlinking does not force a second redesign of the header and page states.

## Explicit Dependency Map

### 1. Define the trade-plan workspace implementation contract

**Blocked by**

- No hard blockers.

**Blocks**

- Issue 2
- Issue 3
- Issue 4
- Issue 5

**Why**

The downstream tickets need a stable ownership split and agreed page composition before implementation detail starts diverging across list, detail, tactical-editor, and relationship-management work.

### 2. Build the trade-plan workspace data contract

**Blocked by**

- Issue 1. Hard blocker.

**Blocks**

- Issue 3
- Issue 4
- Issue 5

**Why**

The current trade-plan UI depends on thin raw queries and route-level query stitching. The redesign work needs stable derived data before the frontend splits into multiple concurrent tickets.

### 3. Redesign the trade-plans index as a first-class tactical workspace entry point

**Blocked by**

- Issue 1. Hard blocker.
- Issue 2. Hard blocker.

**Blocks**

- No hard downstream blockers.

**Why**

The index can ship independently once the workspace query exists. It does not need to wait for the full detail-page redesign.

### 4. Rebuild the trade-plan detail workspace

**Blocked by**

- Issue 1. Hard blocker.
- Issue 2. Hard blocker.
- `Navigation, Shell, And Working Context` hierarchy shell behavior staying stable. Soft dependency because that project is already complete.

**Blocks**

- Issue 5. Soft blocker.

**Why**

This is now the main detail-surface implementation ticket. It intentionally combines page composition, tactical fields, and execution context so one owner can deliver the complete trade-plan detail outcome without handoff churn.

### 5. Add trade-plan relationship management for standalone and linked workflows

**Blocked by**

- Issue 1. Hard blocker.
- Issue 2. Hard blocker.
- Issue 4. Soft blocker.
- `Campaign Workspace` remaining stable enough that narrow consistency updates do not reopen campaign-page scope. Soft dependency.

**Blocks**

- No hard downstream blockers.
- May soft-block final polish on issue 3 if the index needs final relationship controls or labels.

**Why**

Relationship management touches both backend rules and page-level presentation. It should build on the workspace contract and preferably on the final detail-page framing, but it should simplify the current lifecycle rules rather than adding more campaign-status gating.

## Cross-Project Blocking Candidates For Linear

These are the most likely cross-project links to add when the issues become real Linear tickets:

- `Navigation, Shell, And Working Context`: soft dependency for any ticket that relies on the current hierarchy rail, mobile breadcrumbs, or page-level watch affordances remaining stable.
- `Campaign Workspace`: soft dependency for the relationship-management ticket only if trade-plan reparenting requires a narrow consistency follow-up on the campaign detail linked-plan section. It should not own or gate the closed-campaign rule change.
- `Notes, Strategy, And Retrospective Workflow`: soft dependency for the combined trade-plan detail workspace ticket if shared `NotesSection`, note composer, or evidence presentation is actively changing at the same time.
- `Imports And Operational Efficiency`: soft dependency for the combined trade-plan detail workspace ticket if the current `listInboxTradesForTradePlan` and accept-flow behavior proves too limited for the intended pending-import treatment.

## Suggested Issue Count

I recommend creating **5 Linear issues** for `Trade Plan Workspace`.

That keeps contract, data, index, full detail-surface ownership, and relationship management separate without splitting the trade-plan detail page into multiple handoff-heavy tickets.
