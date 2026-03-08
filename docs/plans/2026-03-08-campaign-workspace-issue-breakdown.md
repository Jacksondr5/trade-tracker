# Campaign Workspace Issue Breakdown

**Goal:** Break the `Campaign Workspace` project into a reviewable set of Linear issues before creating tickets.

**Primary sources:** `docs/product/roadmap.md`, `docs/product/feature-philosophy.md`, `docs/product/information-architecture.md`, `docs/product/ux-principles.md`, `docs/product/glossary.md`

**Current implementation anchors:** `src/app/campaigns/CampaignsPageClient.tsx`, `src/app/campaigns/new/page.tsx`, `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`, `convex/campaigns.ts`

---

## Scope For This Project

This project covers the campaign-specific part of the roadmap: turning campaigns into a clearer strategic workspace rather than a thin record with a few embedded sections.

Included:

- Campaign list/index redesign
- Campaign detail information architecture refresh
- Stronger thesis visibility and strategic context
- Better visibility of campaign-linked trade plans and linked execution
- Clearer campaign status behavior and lifecycle handling
- First-pass campaign-level retrospective framing
- Shared UI, form, copy, and visual-system cleanup on touched campaign surfaces

Explicitly out of scope:

- Global shell and local hierarchy implementation already covered by `Navigation, Shell, And Working Context`
- Deep trade-plan content redesign
- Notes workflow redesign beyond campaign-page placement and context
- Strategy editor redesign
- Imports workflow changes
- Analytics expansion and dashboard redesign

## Current State Summary

Campaigns currently exist as a valid but thin strategic object. The backend model is mostly `name`, `thesis`, `status`, `retrospective`, and `closedAt` in `convex/campaigns.ts`. The list page is a simple table with a status filter in `src/app/campaigns/CampaignsPageClient.tsx`. The detail page in `src/app/campaigns/[id]/CampaignDetailPageClient.tsx` supports inline editing of campaign name, thesis, status, notes, linked trade plans, linked trades, and retrospective, but the page is still organized as a sequence of generic sections rather than a cohesive strategic workspace.

## Cross-Project Dependency Assumptions

This project is downstream of the navigation project.

Strong assumptions:

- The authenticated shell work from `Navigation, Shell, And Working Context` is available before the major campaign detail layout issues land
- The local hierarchy rail and mobile breadcrumb model exist before the final campaign detail composition pass
- Cross-link visibility work from the navigation project should inform final campaign detail context treatment

In Linear, I would expect several campaign issues to be blocked by the relevant navigation issues once we create them.

## Recommended Linear Issue Set

### 1. Define the campaign workspace implementation contract

**Purpose**

Lock the campaign-specific scope, layout intent, and cross-project boundaries before the implementation splits into list, detail, lifecycle, and retrospective work.

**Scope**

- Translate the campaign parts of the product docs into an implementation-ready contract
- Define what this project owns versus what remains in `Trade Plan Workspace`, `Notes, Strategy, And Retrospective Workflow`, and the navigation project
- Define the intended campaign detail composition and the role of each major section
- Define required campaign list metadata and campaign detail summary information
- Define the lifecycle and retrospective rules this project will implement

**Deliverables**

- Short implementation contract in `docs/plans/`
- Finalized section ownership for campaign list/detail work
- Finalized dependency guidance for downstream campaign issues

**Notes**

This should be a real Linear issue, not just a hidden planning artifact.

### 2. Build the campaign workspace data contract

**Purpose**

Provide a stable backend-facing contract for the redesigned campaign index and detail surfaces.

**Scope**

- Add the derived data needed for campaign workspace views
- Support campaign-level summary context such as linked trade-plan counts, status breakdowns, linked trade counts, and other campaign-relevant rollups that can be derived cheaply from existing relationships
- Keep the contract campaign-focused rather than turning it into an analytics layer
- Add focused tests for derived campaign workspace data

**Deliverables**

- Workspace-ready campaign queries and/or composed payloads
- Stable frontend data shape for campaign list/detail redesign
- Tests for key edge cases

**Notes**

This issue should avoid deep performance optimization or analytics expansion. It exists to support the campaign workspace.

### 3. Redesign the campaigns index as a strategic workspace entry point

**Purpose**

Make the campaigns list useful for reorientation and prioritization instead of functioning mainly as a thin table.

**Scope**

- Redesign the campaign index layout and information density
- Improve status filtering and scanability
- Surface the most useful strategic metadata from the campaign workspace data contract
- Improve empty, loading, and first-use states on the campaigns index
- Keep the list aligned with shared UI and copy conventions

**Deliverables**

- Redesigned campaigns index page
- Updated status filtering and list presentation
- Improved loading and empty states

**Likely touch points**

- `src/app/campaigns/CampaignsPageClient.tsx`
- campaign page loader/query wiring in `src/app/campaigns/page.tsx`

### 4. Rebuild the campaign detail header and strategic summary area

**Purpose**

Make the top of the campaign page communicate the strategic object clearly before the user scrolls into sections.

**Scope**

- Redesign the campaign detail header and summary composition
- Improve visibility of campaign name, status, thesis summary, and key derived metadata
- Place related object context and page-level actions more intentionally
- Align the top-of-page structure with the hierarchy/context rules from the product docs

**Deliverables**

- New campaign detail header and summary area
- Clearer placement of page-level metadata and actions

**Likely touch points**

- `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`

### 5. Rework the campaign thesis and narrative context section

**Purpose**

Make the campaign’s central strategic thinking easier to read and maintain without collapsing into a generic document editor.

**Scope**

- Redesign how thesis content is presented on campaign detail
- Improve edit/read balance so the campaign thesis is more legible in normal use
- Keep campaign notes nearby in the overall page composition without redesigning the shared notes workflow itself
- Ensure the campaign page preserves strategic narrative before tactical sections take over

**Deliverables**

- Improved campaign thesis section
- Better campaign-page narrative flow around thesis and notes placement

**Notes**

This issue should not take over the notes redesign project. It only owns campaign-page composition and emphasis.

### 6. Rework the campaign-linked trade plan section and inline plan creation flow

**Purpose**

Make the campaign page better at showing and managing the tactical expressions that belong to the campaign.

**Scope**

- Redesign the linked trade-plan section on campaign detail
- Improve scanability of linked plans and their tactical state
- Improve inline campaign-linked trade-plan creation from the campaign page
- Tighten status-management affordances on linked plans where campaign context matters
- Keep clear boundaries with the deeper trade-plan workspace redesign

**Deliverables**

- Redesigned campaign-linked trade-plan section
- Better inline creation flow for campaign-linked plans
- Improved tactical summary treatment from the campaign surface

**Likely touch points**

- `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`
- `convex/tradePlans.ts`

### 7. Improve campaign-level execution visibility

**Purpose**

Help the campaign page show how the strategic idea has actually been expressed in trades without turning the campaign into the primary trade-management surface.

**Scope**

- Redesign the linked trades / execution context section on campaign detail
- Improve clarity of how execution is derived through trade plans
- Surface the most useful campaign-level execution context for review and reorientation
- Preserve clear boundaries with trades as the primary execution record

**Deliverables**

- Better linked-trade visibility on campaign detail
- Improved derived execution context from campaign-linked trade plans

**Notes**

This should stay review-oriented and context-oriented, not become a full trade-detail initiative.

### 8. Clarify campaign status lifecycle behavior and closing workflow

**Purpose**

Make campaign state transitions feel intentional and support later review behavior.

**Scope**

- Review and tighten the `planning -> active -> closed` lifecycle behavior on campaign surfaces
- Improve the UX around closing and reopening campaigns where applicable
- Clarify how linked trade plans should behave when campaign status changes
- Ensure the page communicates closed-state behavior clearly

**Deliverables**

- Cleaner campaign status controls and lifecycle messaging
- Consistent handling of closed campaigns across touched campaign surfaces

**Likely touch points**

- `src/app/campaigns/[id]/CampaignDetailPageClient.tsx`
- `convex/campaigns.ts`
- touched interactions in `convex/tradePlans.ts` where campaign status matters

### 9. Build the campaign retrospective surface

**Purpose**

Turn the current retrospective field into a clearer campaign-level review surface for closed campaigns.

**Scope**

- Redesign the retrospective section on campaign detail
- Improve closed-campaign review framing
- Keep retrospective access and messaging aligned with campaign lifecycle rules
- Make the retrospective section feel like the start of review, not just another freeform textarea

**Deliverables**

- Redesigned campaign retrospective section
- Better closed-campaign review framing and state handling

**Notes**

This issue should not attempt the full retrospective system for the whole app. It owns only the campaign-level retrospective surface.

### 10. Finish campaign workspace visual-system and shared-form cleanup

**Purpose**

Leave the campaign surface in a materially stronger system state after the redesign work lands.

**Scope**

- Move touched campaign UI onto shared primitives where needed
- Eliminate route-local controls that should be handled by the shared UI layer
- Align touched campaign forms and status controls with shared form conventions where practical
- Add loading, empty, and success/error states needed by the redesigned workspace
- Verify dark-mode styling and Radix token compliance on all touched campaign surfaces

**Deliverables**

- Campaign workspace aligned with shared UI and form conventions
- Final consistency pass across list, detail, lifecycle, and retrospective surfaces

## Recommended Issue Order

1. Define the campaign workspace implementation contract
2. Build the campaign workspace data contract
3. Redesign the campaigns index as a strategic workspace entry point
4. Rebuild the campaign detail header and strategic summary area
5. Rework the campaign thesis and narrative context section
6. Rework the campaign-linked trade plan section and inline plan creation flow
7. Improve campaign-level execution visibility
8. Clarify campaign status lifecycle behavior and closing workflow
9. Build the campaign retrospective surface
10. Finish campaign workspace visual-system and shared-form cleanup

## Explicit Dependency Map

### Issue 1. Define the campaign workspace implementation contract

**Blocks**

- Issues 2 through 9

**Why**

The rest of the project depends on a settled interpretation of what the campaign page owns and what remains in adjacent projects.

### Issue 2. Build the campaign workspace data contract

**Blocked by**

- Issue 1

**Blocks**

- Issue 3
- Issue 4
- Issue 6
- Issue 7

**Why**

The campaign index and detail redesigns should build against a stable campaign-focused payload instead of each route inventing its own data stitching.

### Issue 3. Redesign the campaigns index as a strategic workspace entry point

**Blocked by**

- Issue 1
- Issue 2

**Blocks**

- nothing hard-blocked

**Why**

The list redesign depends on the agreed campaign metadata contract, but it can proceed independently from most detail-page work once that exists.

### Issue 4. Rebuild the campaign detail header and strategic summary area

**Blocked by**

- Issue 1
- Issue 2

**Blocks**

- Issue 5
- Issue 6
- Issue 7
- Issue 8

**Why**

The campaign detail header establishes the page-level composition and summary context that the other detail sections should fit into.

### Issue 5. Rework the campaign thesis and narrative context section

**Blocked by**

- Issue 1
- Issue 4

**Blocks**

- nothing hard-blocked

**Why**

Thesis placement and narrative flow should be designed inside the final page structure, not before it.

### Issue 6. Rework the campaign-linked trade plan section and inline plan creation flow

**Blocked by**

- Issue 1
- Issue 2
- Issue 4

**Blocks**

- Issue 7 if execution visibility depends on the redesigned plan section context

**Why**

The trade-plan section should inherit the campaign page structure and use the shared campaign workspace data contract.

### Issue 7. Improve campaign-level execution visibility

**Blocked by**

- Issue 1
- Issue 2
- Issue 4

**Strongly prefers after**

- Issue 6

**Blocks**

- nothing hard-blocked

**Why**

The execution section can be implemented directly after the summary structure exists, but it will land more coherently after the campaign-linked plan section is stabilized.

### Issue 8. Clarify campaign status lifecycle behavior and closing workflow

**Blocked by**

- Issue 1
- Issue 4

**Blocks**

- Issue 9

**Why**

The retrospective surface depends on clear closed-campaign behavior and lifecycle messaging.

### Issue 9. Build the campaign retrospective surface

**Blocked by**

- Issue 1
- Issue 8

**Blocks**

- project completion

**Why**

Campaign retrospective framing should be built on top of the finalized lifecycle and closed-state behavior.

### Issue 10. Finish campaign workspace visual-system and shared-form cleanup

**Blocked by**

- Issue 3
- Issue 4
- Issue 5
- Issue 6
- Issue 7
- Issue 8
- Issue 9

**Blocks**

- project completion

**Why**

This is the final consolidation pass. It should happen after the major workspace pieces are in place.

## Cross-Project Blocking Candidates For Linear

When these issues are turned into Linear tickets, I would consider adding hard blockers from the navigation project where appropriate:

- Campaign detail composition issues should likely be blocked by the core shell and local hierarchy issues from `Navigation, Shell, And Working Context`
- Final campaign detail composition may also want the navigation project’s cross-link visibility work available first

I would finalize those exact cross-project blockers when the campaign tickets are created, based on which navigation issues are still open at that time.
