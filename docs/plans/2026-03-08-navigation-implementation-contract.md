# Navigation Implementation Contract

## Purpose

This document turns the evergreen navigation guidance into an implementation contract for Phase 1 work.

It exists to unblock:

- `JAC-113` Nav 2: authenticated app shell foundation
- `JAC-117` Nav 6: desktop local hierarchy rail
- `JAC-118` Nav 7: mobile hierarchy navigation
- `JAC-121` Nav 10: command palette groundwork

This is a contract for implementation, not a new exploration. If a later ticket needs a different behavior, it should update the evergreen product docs first.

## Source Of Truth

These decisions are derived from:

- `docs/product/navigation-model.md`
- `docs/product/roadmap.md`
- `docs/product/ux-principles.md`
- `docs/product/glossary.md`
- `docs/product/content-and-copy-principles.md`
- `docs/plans/2026-03-07-campaign-trade-plan-navigation-design.md`

## Decision Summary

Phase 1 navigation is locked to the following model:

1. Authenticated desktop uses a grouped left global sidebar.
2. Authenticated mobile uses one unified drawer, not separate global and local drawers.
3. Campaign and trade-plan surfaces use a shared local hierarchy model.
4. Desktop hierarchy browsing happens in a local left rail.
5. Mobile upward movement happens through breadcrumbs; broader switching happens through the unified drawer.
6. `Watchlist` is a cross-cutting focus layer, not a lifecycle state.
7. `Watchlist` v1 supports only `campaign` and `tradePlan`.
8. The command palette is a direct-jump layer for known campaigns and trade plans only.
9. User-facing copy normalizes to `Imports` and `Portfolios` in this phase.

## Authenticated Shell Contract

### Desktop shell

The desktop authenticated shell uses a two-level structure:

- persistent global sidebar on the left
- page area on the right

The global sidebar is the primary app-wide navigation for signed-in routes.
This shell applies to authenticated app routes and does not apply to `/sign-in` or `/sign-up`.

Grouping is fixed for this phase:

- `Activity`
  - `Dashboard`
  - `Trades`
  - `Campaigns`
  - `Trade Plans`
- `Review`
  - `Positions`
  - `Portfolios`
  - `Imports`
- `Writing`
  - `Notes`
  - `Strategy`
- `Settings`
  - `Accounts`

Rules:

- This grouping is shared across desktop and mobile.
- `Campaigns` and `Trade Plans` remain separate global entries even though they share local hierarchy rules.
- The desktop shell replaces the current flat top navigation as the primary authenticated navigation.
- User/account utilities may stay in top chrome, but they are not a substitute for the sidebar.

### Mobile shell

Mobile authenticated navigation uses a single unified drawer.

Rules:

- The drawer always contains the same global section grouping as desktop.
- On campaign and trade-plan surfaces, the same drawer also contains the local hierarchy section.
- The local hierarchy section appears below the global sections in the same drawer, separated visually.
- The app must not introduce a second local drawer in this phase.
- The mobile top bar may expose the drawer trigger, current page title, and command palette trigger.
- This shell applies to authenticated app routes and does not apply to `/sign-in` or `/sign-up`.

## Local Hierarchy Contract

The local hierarchy model applies to the campaign and trade-plan domain only.

### Surfaces in scope

The hierarchy model applies to:

- `/campaigns`
- `/campaigns/[id]`
- `/trade-plans`
- `/trade-plans/[id]`

It does not apply to:

- `Dashboard`
- `Trades`
- `Notes`
- `Strategy`
- `Imports`
- `Positions`
- `Portfolios`
- `Accounts`

### Local groups

The local hierarchy always uses these groups:

- `Watchlist`
- `Campaigns`
- `Standalone Trade Plans`

### Desktop local rail

Desktop campaign and trade-plan surfaces render a contextual left rail beside page content.

Rules:

- The rail is the primary hierarchy control on desktop.
- The rail stays visible across campaign and trade-plan index and detail pages.
- The rail scrolls independently from the main content.
- The active item is always visually distinct.
- Active campaign rows auto-expand.
- Campaigns with watched child trade plans auto-expand.
- `Watchlist` is expanded by default.
- `Standalone Trade Plans` is expanded when the active item is standalone.
- Expansion state should persist while moving within the campaign/trade-plan domain.

### Mobile breadcrumbs

Breadcrumbs are required on campaign and trade-plan detail pages.

Rules:

- Breadcrumbs are the primary upward-navigation control on mobile detail pages.
- Breadcrumbs are not the primary browsing control.
- The unified drawer remains the browsing control for sibling and cross-branch switching.

Examples:

- `Campaigns / Commodity Run Up`
- `Campaigns / Commodity Run Up / URNM`
- `Trade Plans / Standalone / Short ARKK`

## Global Nav Vs Local Nav Vs Command Palette

### Global navigation owns

- movement between top-level product areas
- stable app-wide orientation
- access to singleton and operational surfaces

### Local hierarchy owns

- movement between campaigns and child trade plans
- movement between sibling trade plans
- return to watched campaigns and watched trade plans
- visibility of standalone trade plans as first-class objects

### Command palette owns

- direct jump when the user already knows the object name
- fast recall of watched campaigns and trade plans
- disambiguation of similarly named trade plans via parent context

### Command palette does not own

- hierarchy browsing
- create actions
- edit actions
- bulk actions
- generic app-wide commands

## Watchlist Contract

`Watchlist` is a cross-cutting attention layer and remains separate from lifecycle state.

Rules:

- `watching` status and `Watchlist` membership must remain distinct in UI and data.
- A campaign can be watched regardless of campaign status.
- A trade plan can be watched regardless of trade-plan status.
- Non-watched items remain visible in navigation. `Watchlist` prioritizes; it does not replace the hierarchy.

### V1 storage decision

V1 watch state is persisted through one cross-cutting watchlist model for two entity types only:

- `campaign`
- `tradePlan`

Required constraints:

- persistence is separate from lifecycle state
- watched-object support is intentionally limited to `campaign` and `tradePlan`
- the model stays intentionally narrow in v1 and does not expand into priority systems or custom organization

Implementation note:

- `JAC-112` defines the product boundary and supported object scope.
- `JAC-115` owns the exact Convex schema, validation rules, and query/mutation surface.

Explicitly out of scope for v1:

- watching trades
- watching notes
- watching portfolios
- multiple watchlist views
- custom ordering

## Minimum Navigation Data Requirements

The shell, local rail, mobile drawer, and command palette should be driven by one normalized navigation view model rather than each surface inventing its own shape.

This ticket does not lock the final TypeScript interfaces. It locks the minimum information the implementation must carry.

### Global navigation data must include

- grouped sections for `Activity`, `Review`, `Writing`, and `Settings`
- per-item label
- per-item href
- enough route-matching information to compute stable active state

### Local hierarchy data must include

- whether the current route is inside the campaign/trade-plan domain
- a `Watchlist` collection for watched campaigns and watched trade plans
- a campaign tree with parent campaign rows and nested child trade plans
- a standalone trade-plan collection
- watched state per object
- lifecycle/status information sufficient for ordering and secondary display
- active-state information for the current object
- default expansion information for campaign groups
- parent campaign context for linked trade plans

### Breadcrumb data must include

- ordered breadcrumb segments
- segment labels
- segment hrefs for upward navigation where applicable

### Command palette data must include

- campaign and trade-plan jump targets only in v1
- result label
- result href
- watched state
- optional parent campaign context for linked trade-plan results

Required behavior:

- the same global navigation data drives the desktop sidebar and the global portion of the mobile drawer
- local hierarchy data is absent outside the campaign/trade-plan domain
- the same local hierarchy data drives the desktop rail and the local section of the unified mobile drawer
- breadcrumbs are derived from shared local context instead of route-local string duplication
- command palette results reuse the same campaign/trade-plan source data, with parent context added where needed for disambiguation

### Ordering rules

For `watchlist`, `campaigns`, `standaloneTradePlans`, and `commandPaletteItems`, prefer this ordering:

1. watched items
2. active or open items
3. remaining items
4. alphabetical tie-breaker within the same bucket

For this phase, treat these as open:

- campaign: `Planning`, `Active`
- trade plan: `Idea`, `Watching`, `Active`

Treat `Closed` as the lowest-priority lifecycle bucket unless an item is watched.

## Copy Normalization And Route Cleanup

### Canonical user-facing labels for this phase

Use:

- `Dashboard`
- `Trades`
- `Campaigns`
- `Trade Plans`
- `Notes`
- `Strategy`
- `Positions`
- `Portfolios`
- `Imports`
- `Accounts`
- `Watchlist`

Do not use:

- `Import` for the top-level nav label
- `Portfolio` as the top-level nav label
- `watching` when the product means `on Watchlist`

### Explicit cleanup list

The following cleanup is part of this navigation phase:

1. Change authenticated navigation copy from `Import` to `Imports`.
2. Use `Portfolios` consistently as the top-level destination label.
3. Keep `Watchlist` and lifecycle `watching` visually and semantically distinct.
4. Normalize any route-level headings or shell labels that still use the old top-level names.

The following is not required in this ticket set:

1. Renaming the existing `/portfolio` route segment to `/portfolios`.
2. Renaming data model terms related to `portfolio`.
3. Broad route slug migrations outside the shell and touched navigation surfaces.

Phase 1 normalizes displayed navigation language first. Route-segment churn is deferred unless a later ticket explicitly chooses to pay that migration cost.

## Explicit Out-Of-Scope Boundaries

This contract does not authorize:

- redesigning campaign detail content architecture
- redesigning trade-plan detail content architecture
- changing note, strategy, or import workflows beyond navigation shell touchpoints
- making portfolios part of the campaign or trade-plan parent hierarchy
- adding watchlist support for object types beyond `campaign` and `tradePlan`
- adding dashboard watch modules
- adding trade-detail navigation as a first-class local hierarchy
- turning the command palette into a generic command runner
- introducing a second mobile drawer pattern

## Downstream Ticket Guidance

### `JAC-113` Nav 2

Must implement:

- desktop grouped global sidebar
- mobile unified drawer shell
- canonical top-level labels in shell copy
- shared navigation contract plumbing
- an audit of the existing shared UI layer and relevant ShadCN primitives before freezing shell primitives

Must not implement:

- a separate local mobile drawer
- command palette beyond the trigger and shared data plumbing if needed

Implementation note:

- `JAC-113` should evaluate whether existing shared UI plus relevant ShadCN primitives such as drawer/sheet, sidebar, collapsible, breadcrumb, and command-related primitives are the right base for the shell work before introducing new app-level primitives.

### `JAC-117` Nav 6

Must implement:

- desktop local rail for campaign and trade-plan surfaces
- rail grouping and expansion rules from this contract
- watchlist, campaigns, and standalone trade plans in one local hierarchy model

Must not implement:

- trade-level hierarchy
- portfolio-local hierarchy

### `JAC-118` Nav 7

Must implement:

- detail-page breadcrumbs on mobile
- local hierarchy injection into the unified drawer on campaign and trade-plan surfaces

Must not implement:

- a second local drawer
- breadcrumb-only navigation as a replacement for drawer browsing

### `JAC-121` Nav 10

Must implement:

- `Cmd/Ctrl+K` direct jump to campaigns and trade plans
- watched-item prioritization
- parent campaign context for trade-plan results

Must not implement:

- create commands
- edit commands
- generic app-wide command execution

## Acceptance Standard

This contract is complete when downstream engineers can implement the four dependent tickets without reopening product questions about:

- desktop shell structure
- mobile drawer structure
- local hierarchy ownership
- command palette scope
- watchlist scope
- shared navigation data shape
- navigation copy normalization
- phase boundaries
