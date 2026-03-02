# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Trade Tracker is a trading journal app for recording and analyzing trades across stocks and crypto. It supports thesis-driven campaigns, campaign notes, and optional trade-plan linkage for execution tracking. Built with Next.js 15 (App Router), Convex (serverless backend/database), and Clerk (authentication).

## Commands

```bash
pnpm dev          # Start Next.js dev server (Convex dev server should run separately: npx convex dev)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

No test framework is configured yet. CI runs lint, typecheck, and build.

## Architecture

### Backend: Convex (`convex/`)

All backend logic lives in Convex. There are no Next.js API routes.

### Frontend: Next.js App Router (`src/app/`)

The UI uses Next.js App Router with server/client components under `src/app/`, following App Router routing and layout conventions.

### Forms: TanStack React Form

Forms use `useAppForm` (`src/components/ui/use-app-form.ts`) with pre-registered:

- field components: `FieldInput`, `FieldSelect`, `FieldTextarea`
- form component: `SubmitButton`

Validation uses Zod.

Required form conventions:

- Use `useAppForm` for all user-editable form flows. Do not build ad hoc local-state `<form>` handlers for new work.
- Define a Zod schema per form and wire it through `validators.onChange`.
- Use `form.AppField` with shared field components (`FieldInput`, `FieldSelect`, `FieldTextarea`) instead of raw `<input>`, `<select>`, or `<textarea>` when a shared component exists.
- Wrap submit actions in `form.AppForm` and use `form.SubmitButton` for submit UX and loading/disabled state.
- Use `Alert` for form-level success/error feedback; avoid custom inline error containers.
- If a screen needs a custom control not covered by existing field components, add/extend a reusable field component in `src/components/ui/` and register it in `use-app-form.ts` instead of inlining one-off form markup.

### UI Components (`src/components/ui/`)

Reusable UI components are exported from `src/components/ui/index.ts`.

Prefer icon buttons over text.

### Path Aliases

- `~/*` → `./src/*`
- `~/convex/*` → `./convex/*`

### Auth

Clerk middleware (`src/middleware.ts`) protects all routes except `/sign-in` and `/sign-up`.

Convex auth config: `convex/auth.config.ts`.

## Key Patterns

- Real-time Convex subscriptions are the default data access path (no REST layer)
- Campaigns hold strategic context; trade plans hold tactical setup
- Trades optionally link to `tradePlanId` and can exist unlinked

## UI Component Guidelines

### Badge (`Badge` from `~/components/ui`)

Status/label badges with semantic color variants:

| Variant    | Use for                                      |
|------------|----------------------------------------------|
| `success`  | Active campaigns, buy side, long direction (positions) |
| `danger`   | Sell side, short direction                    |
| `info`     | Planning status, long direction (import inbox) |
| `warning`  | (reserved for future use)                     |
| `neutral`  | Closed campaigns, trade plan statuses         |

### Alert (`Alert` from `~/components/ui`)

Feedback messages (success, error, warning, info). Use `onDismiss` prop for user-dismissible alerts. Prefer `Alert` over inline `<p>` or `<div>` error patterns.

### P&L Colors

- Profit: `text-green-400`, always prefix with `+`
- Loss: `text-red-400`

### Theme

Dark-mode only. No light-mode CSS variables. Color scales: grass, olive, slate, green, red, amber, blue (Radix-based).
