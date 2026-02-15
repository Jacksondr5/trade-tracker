# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Database schema is defined in `convex/schema.ts` with these tables:
- `campaigns`: thesis container (`name`, `status`, `thesis`, optional `retrospective`, optional `closedAt`)
- `tradePlans`: tactical execution plans (optional `campaignId`, instrument + entry/exit/target condition fields, status)
- `trades`: execution records (optional `tradePlanId`, no direct `campaignId`)
- `campaignNotes`: free-form campaign notes (`campaignId`, `content`)
- `portfolioSnapshots`: account value snapshots

Convex functions live in `convex/*.ts`:
- `campaigns.ts`: campaign CRUD/status + campaign-level rollups (PL/positions) through linked trade plans
- `tradePlans.ts`: trade-plan CRUD/status + plan-level queries/PL
- `trades.ts`: trade CRUD + list/get and realized P&L enrichment
- `campaignNotes.ts`: add/get/update campaign notes
- `analytics.ts`: dashboard stats
- `positions.ts`: computed current positions

Auto-generated Convex bindings are in `convex/_generated/` and must stay in sync with schema/functions.

Shared P&L logic is in `convex/lib/plCalculation.ts`.

### Frontend: Next.js App Router (`src/app/`)

Primary routes:
- `/campaigns` and `/campaigns/[id]`
- `/trade-plans`
- `/trades` and `/trades/new`
- `/positions`
- `/portfolio`

Client components use Convex hooks:
- `useQuery(api.module.queryName)` for real-time data
- `useMutation(api.module.mutationName)` for writes

Provider stack (`src/app/providers.tsx`) wraps with `ClerkProvider` and `ConvexProviderWithClerk`.

### Forms: TanStack React Form

Forms use `useAppForm` (`src/components/ui/use-app-form.ts`) with pre-registered:
- field components: `FieldInput`, `FieldTextarea`
- form component: `SubmitButton`

Validation uses Zod.

### UI Components (`src/components/ui/`)

Reusable UI components are exported from `src/components/ui/index.ts`.

Styling uses Tailwind CSS v4 and the `cn()` helper (`src/lib/utils.ts`).

### Path Aliases

- `~/*` → `./src/*`
- `~/convex/*` → `./convex/*`

### Environment Variables

Validated in `src/env.ts` via `@t3-oss/env-nextjs`.

Required vars:
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Set `SKIP_ENV_VALIDATION=true` to bypass validation (used in CI).

### Auth

Clerk middleware (`src/middleware.ts`) protects all routes except `/sign-in` and `/sign-up`.

Convex auth config: `convex/auth.config.ts`.

## Key Patterns

- Real-time Convex subscriptions are the default data access path (no REST layer)
- Campaigns hold strategic context; trade plans hold tactical setup
- Trades optionally link to `tradePlanId` and can exist unlinked
- Campaign-level P&L/position stats are derived through linked trade plans, then trades
- Realized P&L is computed from trade history (not persisted) via `convex/lib/plCalculation.ts`
- Node.js is pinned at `22.19.0` (`.nvmrc`), package manager is pnpm `10.16.1`
