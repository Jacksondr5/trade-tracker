# Technical Architecture Overview

## Purpose

This document is a technical map of the Trade Tracker codebase.

It is not a product spec, a roadmap, or a data-model document. Its job is to explain how this repository is organized, which implementation conventions are mandatory, and how new work should fit into the existing architecture.

## Stack And Runtime Choices

Trade Tracker is built with:

- `Next.js` App Router for the frontend
- `Convex` for backend logic and persistence
- `Clerk` for authentication
- `TanStack React Form` for form state and validation wiring
- `Vitest` for unit-style tests
- `Playwright` for end-to-end tests

Other stable assumptions:

- dark-mode-only UI
- Radix-token-based styling

## Codebase Organization

### Frontend app structure

`src/app/` contains route entry points, layouts, and route-local client components.

The current pattern is:

- route entry files stay in `src/app/**/page.tsx`
- page-specific client components sit near the route, usually as `*PageClient.tsx`
- route-specific helpers stay inside the route folder when they are not shared elsewhere

### Shared UI layer

`src/components/ui/` contains reusable UI primitives and shared form components.

This is the default place for:

- buttons
- inputs
- cards
- dialogs
- alerts
- badges
- radio groups
- shared field components
- the shared form hook

Exports are centralized through [index.ts](/Users/jackson/.t3/worktrees/trade-tracker/t3code-0d31f8c4/src/components/ui/index.ts).

`src/components/` holds higher-level shared app components that are not low-level UI primitives, such as the app header, auth gate, and reusable page sections.

### Shared libraries

`src/lib/` contains domain and utility logic that is not tied to a single route.

This is the place for shared parsing, validation, formatting, utility, and server-only helpers that do not belong to a single route.

### Backend

`convex/` contains the backend surface for the application.

Backend code is organized by domain, with shared helpers under `convex/lib/` and schema ownership in the Convex schema definition.

Generated Convex artifacts live under `convex/_generated/` and should be treated as generated files rather than hand-edited architecture.

### Product documentation

Evergreen product docs live in `docs/product/`.

Dated design and implementation documents live in `docs/plans/`.

Contributors should use the product docs for current product-wide guidance instead of inferring product intent from old plan documents.

## Mandatory Implementation Conventions

### Backend access

- All backend logic goes through `Convex`.
- Do not add Next.js API routes as a parallel backend surface.
- Keep backend logic in the domain module that owns the behavior, or in `convex/lib/` if it is genuinely shared.

### Forms

- All user-editable forms should use `useAppForm`.
- Validation should be defined with `Zod`.
- Shared field components should be used before introducing raw inputs or one-off form markup.
- Form-level feedback should use the shared `Alert` pattern.

### Shared UI

- Reuse existing components from `src/components/ui/` before creating new ones.
- If an existing component is close, extend it instead of forking the pattern.
- New primitives should be added through the shared UI layer, not embedded ad hoc inside feature code.

### Styling

- The app is dark-mode only.
- Use Radix token families already defined in `src/styles/global.css`.
- Do not introduce Tailwind default grays or other ad hoc color scales.
- Keep styling aligned with `docs/product/visual-design-system.md`.

### Status and feedback patterns

- Reuse shared badge, alert, dialog, and button patterns.
- Keep copy aligned with `docs/product/content-and-copy-principles.md`.
- Do not let individual routes invent new status semantics when an existing pattern already covers the use case.

### Path aliases

The codebase uses:

- `~/*` for `src/*`
- `~/convex/*` for `convex/*`

Use those aliases consistently instead of deep relative import chains when crossing major folders.

## Testing And Development Workflow

### Worktree bootstrap

New worktrees may be missing:

- `.env.local`
- `node_modules/`

Before running the app or Playwright:

- copy `.env.local` from the main checkout if needed
- run `pnpm install` if dependencies are missing

### UI testing

- `playwright-interactive` is the default workflow for UI checks in this repo
- the app should be running before browser automation begins
- prefer `127.0.0.1` over `localhost`
- shared auth state lives in `output/playwright/auth.json`
- use Playwright CLI only as a fallback when the interactive flow is unhealthy or unsuitable

### CI expectations

Work should be considered incomplete if it breaks the repository's standard validation and build checks.

## Rules For Future Technical Changes

- Do not introduce a second backend pattern beside Convex.
- Do not bypass the shared form system without a concrete reason.
- Do not add one-off UI primitives when the shared UI layer should own them.
- Do not let route-local code become the default home for logic that is actually shared across the app.
- Extend domain modules and existing patterns before creating parallel abstractions.
- Treat `docs/product/` as the source of truth for product-wide behavior, terminology, and design direction.

## Summary

Trade Tracker is organized around a small number of deliberate technical choices:

- App Router on the frontend
- Convex as the only backend surface
- a shared UI and form layer
- dark-mode-only Radix-token styling
- product guidance centralized in `docs/product/`

New work should fit those patterns unless there is a strong reason to change the architecture itself.
