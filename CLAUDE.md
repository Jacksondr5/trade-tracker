# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trade Tracker is a trading journal app for recording and analyzing trades across stocks and crypto. Built with Next.js 15 (App Router), Convex (serverless backend/database), and Clerk (authentication).

## Commands

```bash
pnpm dev          # Start Next.js dev server (Convex dev server must be started separately: npx convex dev)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

No test framework is configured yet. CI runs lint, typecheck, and build.

## Architecture

### Backend: Convex (`convex/`)

All backend logic lives in Convex — there are no Next.js API routes. The database schema is in `convex/schema.ts` with four tables: `campaigns`, `trades`, `campaignNotes`, and `portfolioSnapshots`.

Convex functions (queries/mutations) are in `convex/*.ts`. The auto-generated types in `convex/_generated/` provide a type-safe `api` object used by the frontend. Validators in each function file must match the schema definitions.

Shared business logic (P&L calculation) is in `convex/lib/plCalculation.ts`.

### Frontend: Next.js App Router (`src/app/`)

Pages use the App Router convention. Client components use Convex React hooks:
- `useQuery(api.module.queryName)` for real-time data subscriptions
- `useMutation(api.module.mutationName)` for writes

The provider stack (`src/app/providers.tsx`) wraps the app with `ClerkProvider` and `ConvexProviderWithClerk` for authenticated real-time data access.

### Forms: TanStack React Form

Forms use a custom `useAppForm` hook (`src/components/ui/use-app-form.ts`) built on `@tanstack/react-form` with pre-registered field components (`FieldInput`, `FieldTextarea`) and form components (`SubmitButton`). Validation uses Zod schemas.

### UI Components (`src/components/ui/`)

Reusable components built on Radix UI primitives. All UI components are exported from `src/components/ui/index.ts`. Styling uses Tailwind CSS v4 with the `cn()` utility (clsx + tailwind-merge) from `src/lib/utils.ts`.

### Path Aliases

- `~/*` → `./src/*`
- `~/convex/*` → `./convex/*`

### Environment Variables

Validated at runtime via `@t3-oss/env-nextjs` in `src/env.ts`. Set `SKIP_ENV_VALIDATION=true` to bypass (used in CI). Required vars: `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.

### Auth

Clerk middleware (`src/middleware.ts`) protects all routes except `/sign-in` and `/sign-up`. Convex auth is configured in `convex/auth.config.ts`.

## Key Patterns

- All data fetching is real-time through Convex subscriptions — no REST endpoints or `fetch` calls
- Campaigns have nested arrays for instruments, entry/profit targets, and stop-loss history
- P&L is calculated from trade history, not stored — see `convex/lib/plCalculation.ts` for the algorithm
- Positions (open holdings) are computed on-the-fly from trade records in `convex/positions.ts`
- Node.js version is pinned at 22.19.0 (`.nvmrc`), package manager is pnpm 10.16.1
