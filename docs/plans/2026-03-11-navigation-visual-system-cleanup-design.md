# Navigation Visual-System Cleanup Design

## Goal

Finish the navigation project with a constrained cleanup pass that brings the touched shell and hierarchy surfaces onto shared UI patterns, adds consistent loading and empty states for new async navigation surfaces, and aligns the main campaign and trade-plan entry pages with the approved dark visual system.

## Constraints

- Follow [docs/product/visual-design-system.md](../product/visual-design-system.md), [docs/product/technical-architecture-overview.md](../product/technical-architecture-overview.md), and [docs/plans/2026-03-08-navigation-implementation-contract.md](./2026-03-08-navigation-implementation-contract.md).
- Keep this ticket focused on touched navigation surfaces and the two hierarchy entry pages.
- Reuse `src/components/ui/` primitives before adding new route-local controls.
- Do not turn this ticket into a full campaign or trade-plan detail-screen redesign.

## Decisions

### Scope boundary

This cleanup includes:

- authenticated shell surfaces in `src/components/app-shell/`
- desktop local hierarchy rail
- mobile hierarchy drawer loading and empty states
- command palette loading and empty states
- `Campaigns` index page
- `Trade Plans` index page

This cleanup does not include:

- campaign detail editor modernization
- trade-plan detail editor modernization
- unrelated app-wide token cleanup

### Shared navigation states

Create one small shared app-shell pattern for navigation loading and empty states instead of repeating route-local text blocks.

That shared pattern should support:

- rail sections while hierarchy data is loading
- rail sections with no items
- mobile drawer local-hierarchy loading
- command palette loading and no-results messaging

The pattern should stay lightweight and scoped to navigation surfaces rather than becoming a generic app-wide empty-state system.

### Shared controls

Replace route-local shell controls with shared primitives where the shell currently owns them:

- mobile drawer trigger uses the shared `Button`
- hierarchy group toggles use shared button styling
- watchlist action errors use the shared `Alert`

Campaign row expanders may stay structurally local, but they should stop being one-off button styling islands.

### Visual-system cleanup on entry pages

Update the `Campaigns` and `Trade Plans` index pages to use the approved olive/slate surface mapping.

That means:

- remove old `slate-700` / `slate-800` card and table shells where the new shell now surrounds these pages
- use shared UI form controls where a route-local `select` is still present
- keep dense tabular content on slate surfaces only where that density is intentional

### Explicit out-of-scope detail pages

The campaign and trade-plan detail pages still contain many raw inputs, selects, and buttons. They are not part of this ticket unless a direct shell consistency fix requires a minimal touch.

This boundary keeps JAC-122 as a consolidation pass for the navigation project rather than reopening broader screen-level modernization.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- targeted tests covering app-shell navigation helpers
- UI spot-check of `/campaigns` and `/trade-plans`
