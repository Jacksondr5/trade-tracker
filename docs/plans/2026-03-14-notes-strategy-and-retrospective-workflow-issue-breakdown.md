# Notes, Strategy, And Retrospective Workflow Issue Breakdown

**Goal:** Break the `Notes, Strategy, And Retrospective Workflow` project into a reviewable set of Linear issues before creating tickets.

**Primary product-doc sources:** `docs/product/roadmap.md`, `docs/product/information-architecture.md`, `docs/product/feature-philosophy.md`, `docs/product/ux-principles.md`, `docs/product/content-and-copy-principles.md`, `docs/product/visual-design-system.md`, `docs/product/glossary.md`, `docs/product/navigation-model.md`

**Current implementation anchors:** `src/app/(app)/notes/page.tsx`, `src/app/(app)/notes/NotesPageClient.tsx`, `src/components/NotesSection.tsx`, `convex/notes.ts`, `src/app/(app)/strategy/page.tsx`, `src/app/(app)/strategy/StrategyPageClient.tsx`, `src/components/ui/strategy-editor.tsx`, `convex/strategyDoc.ts`, `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`, `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`, `convex/campaigns.ts`, `convex/tradePlans.ts`, `convex/schema.ts`, `src/components/app-shell/CampaignTradePlanHierarchyLayout.tsx`, `convex/navigation.ts`

---

## Scope For This Project

This project covers the phase-2 work needed to strengthen the product's main thinking, evidence, and first-pass review surfaces without absorbing the broader campaign-page and trade-plan-page redesign work.

Included:

- Strategy surface redesign so `Strategy` feels like a durable operating document instead of a thin editor wrapper
- Notes workflow redesign across global and contextual note-taking surfaces
- Removal of trade-level notes from the product model and implementation surface
- First-class chart/image evidence handling for notes
- A shared retrospective workflow for the first reviewable campaign and trade-plan use cases
- Better visibility of related note, trade, campaign, and trade-plan context on touched thinking surfaces
- Shared UI, form, copy, and regression cleanup on touched notes, strategy, and review surfaces

Explicitly out of scope:

- Campaign list, campaign header, campaign thesis, linked-trade-plan, and execution redesign work already owned by `Campaign Workspace`
- Broader trade-plan workspace redesign, including richer tactical fields such as rationale, entry, target, exit, and instrument notes
- A new first-class trade-detail workflow
- Dashboard, analytics, or retrospective-summary expansion
- Imports workflow changes
- Global shell, hierarchy rail, breadcrumb, or command-palette redesign already owned by the completed navigation project

## Current State Summary

The current notes and strategy surfaces are structurally valid but thin. `/notes` only renders general notes through `api.notes.getGeneralNotes` in `src/app/(app)/notes/page.tsx` and `src/app/(app)/notes/NotesPageClient.tsx`, so the main Notes page is not yet the unified chronological notes workflow described by the product docs. `src/components/NotesSection.tsx` is a single reusable block used on the Notes page plus campaign and trade-plan detail pages, but it still behaves like a generic textarea list with manual chart URL inputs rather than a journal-style evidence surface.

The backend also still reflects the old trade-level-note direction. `convex/schema.ts` and `convex/notes.ts` still allow `tradeId` on notes and expose `getNotesByTrade`, even though the updated product direction is to remove trade-attached notes entirely. The notes redesign should therefore treat removal of trade-level notes as part of the foundational notes/data-contract work, not as follow-up cleanup.

`Strategy` is currently a singleton markdown document saved through `convex/strategyDoc.ts` and rendered through `src/components/ui/strategy-editor.tsx`, but the route is still mostly a centered editor card with minimal document framing, minimal metadata, and only basic autosave feedback. This does not yet match the product requirement that `Strategy` feel formal and document-like.

Retrospective support is even thinner. The only existing review surface is the campaign-only `retrospective` string field rendered inside `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx` after a campaign is closed. There is no shared retrospective model, no trade-plan review surface, no shared evidence assembly around review, and no reusable review primitives.

## Cross-Project Dependency Assumptions

This project is downstream of the navigation work and must coordinate with campaign and future trade-plan workspace work.

Strong assumptions:

- The navigation prerequisites are already satisfied by completed tickets `JAC-112`, `JAC-113`, `JAC-116`, `JAC-117`, `JAC-118`, and `JAC-120`
- The app shell, hierarchy rail, breadcrumbs, watchlist model, and hierarchy query should be treated as stable inputs rather than reopened here
- Campaign-page composition work already underway in `Campaign Workspace` should continue to own campaign header, thesis, linked-plan, and execution layout outside the touched notes/review sections

Important coordination assumptions:

- `JAC-125` is a soft dependency for campaign notes placement, because that ticket owns campaign thesis and narrative composition
- `JAC-128` is a soft-to-hard dependency for campaign retrospective rollout, because it owns close-state review framing and lifecycle messaging
- `JAC-130` is a soft dependency for cleanup and shared-primitives follow-through so the same cleanup work is not split awkwardly across projects
- `Trade Plan Workspace` should own broader trade-plan information architecture and tactical-field redesign; this project should only touch shared notes/review sections and supporting data contracts on trade-plan detail

## Recommended Linear Issue Set

### 1. Define the notes implementation contract, remove trade-level notes, and build the shared notes/evidence data contract

**Purpose**

Lock the project boundaries early while also landing the foundational notes-model and backend work that every downstream notes and retrospective ticket depends on.

**Scope**

- Translate the relevant evergreen product docs into an implementation-ready contract for this project
- Define what this project owns versus what remains in `Campaign Workspace`, `Trade Plan Workspace`, and later analytics/review work
- Define the intended relationship between the global Notes page and contextual notes blocks
- Confirm that trade-level notes are being removed rather than deferred
- Remove trade-level notes from the data model, queries, and touched frontend assumptions
- Extend the notes schema and query surface to support a unified chronological notes feed
- Preserve one unified notes model for campaign notes, trade-plan notes, and general notes
- Introduce the attachment/evidence model needed for chart and image support
- Add the minimal parent/context metadata needed for the UI to show where a note belongs and link back to the parent object
- Add focused backend validation and regression coverage

**Deliverables**

- Short implementation contract in `docs/plans/`
- Finalized ownership matrix for notes, strategy, and retrospective work
- Finalized dependency guidance for downstream tickets in this project
- Updated Convex schema for notes and evidence metadata
- Removal of `tradeId`-based note ownership from the supported notes model
- Queries and mutations that support global and contextual note workflows
- A first-pass upload/read contract for note evidence
- Backend tests covering ownership, single-parent enforcement, feed behavior, and trade-note removal

**Likely touch points**

- `convex/schema.ts`
- `convex/notes.ts`
- touched note-related types and loaders in `src/app/(app)/notes/`, campaign detail, and trade-plan detail
- new note-evidence helpers or storage-facing backend modules under `convex/`

**Notes**

Keep notes unified across campaign, trade-plan, and general contexts. Do not replace trade-level notes with another trade-attached note variant.

### 2. Rebuild the unified notes workflow across global and contextual surfaces

**Purpose**

Ship the redesigned notes experience as one larger delivery across the shared notes components, the global Notes page, and the contextual notes sections on campaign and trade-plan detail pages.

**Scope**

- Replace the current generic `NotesSection` with reusable notes primitives that behave like a fast journal and evidence log
- Redesign `/notes` into a unified chronological page that shows all supported notes, regardless of parent type, with clear parent-context labels and links
- Roll the shared notes workflow into the campaign and trade-plan detail notes sections
- Support add and edit flows, evidence preview, loading states, empty states, and error states across the touched notes surfaces
- Move touched notes UI onto shared primitives instead of route-local raw controls

**Deliverables**

- Reusable notes composer and timeline/list primitives
- Redesigned `/notes` page with unified chronological feed and parent-context treatment
- Upgraded campaign notes surface
- Upgraded trade-plan notes surface

**Likely touch points**

- `src/components/NotesSection.tsx`
- new shared notes components under `src/components/` and/or `src/components/ui/`
- `src/app/(app)/notes/page.tsx`
- `src/app/(app)/notes/NotesPageClient.tsx`
- `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`
- `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`
- `src/styles/global.css`

**Notes**

This is intentionally a larger ticket. It owns the shared notes UX across the touched surfaces, but it should not reopen broader campaign-page or trade-plan-page information architecture outside the notes sections.

### 3. Redesign the Strategy surface as a formal operating document

**Purpose**

Make `Strategy` feel durable, readable, and document-like instead of a lightly framed editor card.

**Scope**

- Redesign the page shell and editor framing for the strategy document
- Improve save feedback, error handling, and basic document metadata presentation where helpful
- Align the editor surface with the visual system's document rules
- Keep the existing single-document model unless the implementation contract identifies a clear reason not to

**Deliverables**

- Redesigned `/strategy` experience
- Improved editor framing, save-state treatment, and empty-state handling
- Any minimal backend changes needed to support the updated strategy experience

**Likely touch points**

- `src/app/(app)/strategy/page.tsx`
- `src/app/(app)/strategy/StrategyPageClient.tsx`
- `src/components/ui/strategy-editor.tsx`
- `convex/strategyDoc.ts`
- `src/styles/global.css`

**Notes**

Do not turn this into a template-builder or long-form knowledge-base project. The product docs still define Strategy as one formal operating document per user.

### 4. Ship the first retrospective workflow across campaign and trade-plan surfaces

**Purpose**

Combine the retrospective model, reusable review primitives, and first consumer surfaces into one deliverable that establishes the product's first real review workflow.

**Scope**

- Define the v1 retrospective storage model and queries
- Support the first shared review cases needed by campaign and trade-plan surfaces
- Build reusable retrospective section primitives and supporting evidence/context blocks
- Replace the current campaign-only review textarea with the shared retrospective surface
- Add the first trade-plan retrospective surface and its lifecycle gating
- Align close-state copy and behavior with existing lifecycle rules
- Add lifecycle-aware backend validation and regression coverage

**Deliverables**

- Retrospective backend contract
- Reusable review UI primitives
- Campaign retrospective adoption
- Trade-plan retrospective adoption
- Regression coverage for ownership and lifecycle rules

**Likely touch points**

- `convex/schema.ts`
- `convex/campaigns.ts`
- `convex/tradePlans.ts`
- new retrospective-focused backend modules under `convex/`
- new shared review components under `src/components/`
- `src/app/(app)/campaigns/[id]/CampaignDetailPageClient.tsx`
- `src/app/(app)/trade-plans/[id]/TradePlanDetailPageClient.tsx`

**Notes**

Keep this to first-pass retrospectives. Do not absorb retrospective summaries, dashboard review signals, or broader campaign/trade-plan layout redesign.

### 5. Harden shared primitives and regression coverage for touched thinking surfaces

**Purpose**

Leave the notes, strategy, and review surfaces in a materially stronger technical state after the redesign work lands.

**Scope**

- Remove remaining route-local raw controls on touched notes, strategy, and review surfaces where shared primitives should own the pattern
- Add focused backend tests for the notes and retrospective contracts
- Add frontend and end-to-end coverage for the core notes, strategy, and review flows
- Close obvious loading, empty-state, and visual-system gaps on the touched surfaces

**Deliverables**

- Shared-primitives cleanup on touched thinking surfaces
- Convex and component regression coverage
- Targeted Playwright coverage for core notes, strategy, and review paths

**Likely touch points**

- touched frontend files from Issues 3 through 5
- `convex/*.test.ts`
- `tests/e2e/`

**Notes**

This should not become a catch-all cleanup bucket for unrelated campaign or trade-plan work.

## Recommended Issue Order

1. Issue 1: Define the notes implementation contract, remove trade-level notes, and build the shared notes/evidence data contract
2. Issue 2: Rebuild the unified notes workflow across global and contextual surfaces
3. Issue 3: Redesign the Strategy surface as a formal operating document
4. Issue 4: Ship the first retrospective workflow across campaign and trade-plan surfaces
5. Issue 5: Harden shared primitives and regression coverage for touched thinking surfaces

Parallelization notes:

- Issue 3 can start after Issue 1 and run mostly in parallel with Issue 2
- Issue 4 can start once the implementation contract and notes/evidence contract are stable, but it still needs coordination with campaign close-state rules and touched page-composition work

## Explicit Dependency Map

### Issue 1. Define the notes implementation contract, remove trade-level notes, and build the shared notes/evidence data contract

- Blocked by: none
- Blocks: Issues 2 through 4
- Why: the project still has real overlap risk with `Campaign Workspace`, `Trade Plan Workspace`, and later review work, and the frontend cannot safely redesign notes or assemble retrospective evidence until the supported note-ownership model, notes feed, and attachment contract are stable

### Issue 2. Rebuild the unified notes workflow across global and contextual surfaces

- Blocked by: Issue 1
- Soft-blocked by: `JAC-125` and any future `Trade Plan Workspace` detail-layout tickets
- Blocks: Issue 5
- Why: the shared notes UX should land only once the notes model is stable, and the exact contextual insertion points should not conflict with adjacent campaign/trade-plan composition work

### Issue 3. Redesign the Strategy surface as a formal operating document

- Blocked by: Issue 1
- Blocks: Issue 5
- Why: Strategy is mostly independent once scope is locked, but the final cleanup and regression pass should happen after the redesign lands

### Issue 4. Ship the first retrospective workflow across campaign and trade-plan surfaces

- Blocked by: Issue 1
- Soft-blocked by: Issue 2, `JAC-128`, and any future `Trade Plan Workspace` detail-layout tickets
- Blocks: Issue 5
- Why: the first retrospective workflow depends on the shared notes/evidence contract and should stay aligned with campaign close-state rules plus the touched page-composition work around campaign and trade-plan detail

### Issue 5. Harden shared primitives and regression coverage for touched thinking surfaces

- Blocked by: Issues 2, 3, and 4
- Blocks: none
- Why: this is the project closeout pass that should verify the final touched surfaces instead of repeatedly chasing moving targets

## Cross-Project Blocking Candidates For Linear

Already satisfied prerequisites that should be treated as completed inputs, not reopened blockers:

- `JAC-112` `Nav 1: Define navigation implementation contract`
- `JAC-113` `Nav 2: Build the authenticated app shell foundation`
- `JAC-116` `Nav 5: Build the campaign and trade-plan hierarchy data layer`
- `JAC-117` `Nav 6: Build the desktop local hierarchy rail for campaigns and trade plans`
- `JAC-118` `Nav 7: Add mobile hierarchy navigation with breadcrumbs`
- `JAC-120` `Nav 9: Clarify standalone versus campaign-linked trade-plan presentation`

Active coordination candidates:

- `JAC-125` `Campaign Workspace: Rework thesis and narrative context`
  Why: contextual campaign notes should not reopen campaign-page composition decisions already being made there
- `JAC-128` `Campaign Workspace: Clarify lifecycle and close-state review framing`
  Why: campaign retrospective rollout must align with the close-state rules and messaging this ticket settles
- `JAC-130` `Campaign Workspace: Harden shared primitives and regression coverage`
  Why: touched campaign notes/review cleanup and regression work should not be duplicated across both projects

Project-level coordination candidate with no existing issue IDs yet:

- `Trade Plan Workspace`
  Why: this project should avoid absorbing broader trade-plan detail information architecture or richer tactical-field work; if that project opens detail-layout tickets before Issue 2 or Issue 4 lands, treat them as soft blockers for the exact insertion points on the trade-plan page
