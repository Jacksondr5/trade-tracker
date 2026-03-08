# Authenticated Shell Foundation Design

## Goal

Replace the current flat authenticated header navigation with a reusable shell that supports the Phase 1 navigation model on desktop and mobile, while keeping scope limited to global navigation and route normalization.

## Constraints

- Follow `docs/product/navigation-model.md`, `docs/product/visual-design-system.md`, and `docs/plans/2026-03-08-navigation-implementation-contract.md`.
- Keep this ticket focused on the global shell foundation.
- Do not implement the campaign/trade-plan local hierarchy rail or mobile breadcrumb system in this ticket.
- Reuse the existing shared UI layer where it already covers the needed primitive.

## Decisions

### Layout boundary

Use route groups to separate public auth pages from the authenticated app shell:

- `src/app/(public)` for `/sign-in` and `/sign-up`
- `src/app/(app)` for `/` and authenticated product routes

The `(app)` layout owns `AuthGate` and the shell wrapper. The root route remains publicly reachable for signed-out users, but signed-in users see it inside the authenticated shell.

### Shared navigation model

Create one navigation config for the global sections:

- `Activity`
- `Review`
- `Writing`
- `Settings`

Each item carries:

- label
- href
- route prefixes used for active-state matching

Desktop and mobile both render from this config so the grouping and active-state rules stay aligned.

### Shell primitives

Build the shell from existing pieces rather than inventing a new primitive stack:

- reuse the existing Radix dialog wrapper for the mobile drawer
- use shared styling helpers and product color tokens for shell surfaces
- keep navigation rendering in dedicated shell components instead of expanding the old `Header`

### Scope boundary

This ticket delivers:

- authenticated desktop sidebar
- mobile top bar and unified drawer
- shared nav config
- route normalization from `/portfolio` to `/portfolios`

This ticket does not deliver:

- local hierarchy data loading
- watchlist nav
- campaign/trade-plan rail behavior
- mobile breadcrumbs
- command palette

## Verification

- `pnpm lint`
- `pnpm typecheck`
- spot-check `/`, `/sign-in`, `/campaigns`, and `/portfolios`
