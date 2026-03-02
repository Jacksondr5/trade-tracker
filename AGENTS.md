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

**IMPORTANT — Reuse existing components.** Before building any UI element, check `src/components/ui/index.ts` for an existing component that does what you need. If an existing component is close but not quite right, extend it with a new variant or prop rather than creating a new component. Do not build custom buttons, inputs, cards, dialogs, labels, textareas, alerts, badges, or radio groups — these already exist.

**Adding new components:** Use the ShadCN CLI to add new components:

```bash
npx shadcn@latest add <component-name>
```

After adding a ShadCN component, you MUST make these modifications before using it:
1. **Replace CSS variable colors** with Radix color tokens (see Style Standards below)
2. **Add `dataTestId` prop** to any interactive element (all interactive components require this)
3. **Verify dark-mode appearance** — this app is dark-mode only

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

| Variant   | Use for                                                |
| --------- | ------------------------------------------------------ |
| `success` | Active campaigns, buy side, long direction (positions) |
| `danger`  | Sell side, short direction                             |
| `info`    | Planning status, long direction (import inbox)         |
| `neutral` | Closed campaigns, trade plan statuses                  |

### Alert (`Alert` from `~/components/ui`)

Feedback messages (success, error, warning, info). Use `onDismiss` prop for user-dismissible alerts. Prefer `Alert` over inline `<p>` or `<div>` error patterns.

### Theme

Dark-mode only. No light-mode CSS variables. Color scales: grass, olive, slate, green, red, amber, blue (Radix-based).

#### Style Standards

All components must follow these conventions for consistency:

| Property | Standard |
|----------|----------|
| Surface backgrounds | `bg-olive-2` (cards, dialogs, dropdowns) |
| Surface borders | `border-olive-6` (resting), `border-olive-7` (inputs) |
| Primary text | `text-olive-12` or `text-slate-12` |
| Secondary text | `text-olive-11` or `text-slate-11` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:ring-offset-2 focus-visible:ring-offset-olive-1` |
| Primary action | `bg-grass-9 hover:bg-grass-10 text-grass-1` |
| Destructive action | `bg-red-9 hover:bg-red-10 text-red-1` |
| Disabled (buttons) | `disabled:pointer-events-none disabled:opacity-50` |
| Disabled (inputs) | `disabled:cursor-not-allowed disabled:opacity-50` |
| Transitions | `transition-colors` (not `transition-all`) |

Do NOT use Tailwind's default color scales (e.g., `slate-700`, `slate-800`, `gray-200`). Always use the Radix 12-step tokens defined in `src/styles/global.css`.
