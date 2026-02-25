# CLAUDE.md

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

Frontend: Next.js App Router (`src/app/`)

### Forms: TanStack React Form

Forms use `useAppForm` (`src/components/ui/use-app-form.ts`) with pre-registered:

- field components: `FieldInput`, `FieldTextarea`
- form component: `SubmitButton`

Validation uses Zod.

### UI Components (`src/components/ui/`)

Reusable UI components are exported from `src/components/ui/index.ts`.

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
