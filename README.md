# Trade Tracker

Trade Tracker is a trading journal for stocks and crypto built around the full decision cycle, not just fills. It lets you capture campaign-level thesis, define trade plans, import or enter executions, review open positions, organize trades into portfolios, and keep notes tied to the work.

The app is built with Next.js on the frontend, Convex for the backend and real-time data layer, and Clerk for authentication.

## What the app does

- Journal manual trades across stocks and crypto
- Import broker/exchange CSVs from Interactive Brokers and Kraken into a review inbox
- Link trades to trade plans and trade plans to campaigns
- Track campaign status from planning to active to closed, including retrospectives
- Maintain freeform notes and a per-user strategy document
- Group trades into portfolios and derive open positions from executions
- Keep all data scoped to the signed-in Clerk user

## Core concepts

- `Campaigns`: the higher-level thesis or idea you are working on
- `Trade Plans`: the tactical setup for a symbol, optionally linked to a campaign
- `Trades`: the actual executions, entered manually or accepted from imports
- `Import Inbox`: pending imported trades that can be validated, edited, linked, and accepted
- `Portfolios`: optional buckets for grouping trades
- `Notes` and `Strategy`: supporting written context for trades, plans, campaigns, and your overall process

## Tech stack

- Next.js 16 App Router
- React 19
- Convex for database, queries, mutations, and realtime sync
- Clerk for auth
- TypeScript
- Tailwind CSS 4
- TanStack React Form + Zod for form handling and validation
- Vitest for test execution
- Playwright for end-to-end browser testing

## Getting started

### Prerequisites

- Node.js `24.14.0` (see `.nvmrc`)
- `pnpm` `10.x`
- A Convex account/project
- A Clerk application

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up Convex

Start the Convex dev workflow in a separate terminal:

```bash
pnpm convex dev
```

If this is your first time running it, the CLI will prompt you to create or select a deployment and will provide your Convex URL.

### 3. Set up Clerk

Create a Clerk app, then make sure you have:

- a publishable key
- a secret key
- the Clerk frontend API URL
- a JWT template named `convex`

That JWT template is required because server components request a Clerk token with `template: "convex"` before preloading Convex queries.

### 4. Create `.env.local`

Start from the checked-in example:

```bash
cp .env.example .env.local
```

Then fill in the values:

```bash
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_CLERK_FRONTEND_API_URL=your-clerk-frontend-api-url
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
PLAYWRIGHT_USERNAME=your-playwright-test-user@example.com
PLAYWRIGHT_PASSWORD=your-playwright-test-password
PLAYWRIGHT_OWNER_ID=your-clerk-token-identifier-for-the-playwright-user
VERCEL_AUTOMATION_BYPASS_SECRET=your-vercel-automation-bypass-secret
```

Notes:

- `NEXT_PUBLIC_CONVEX_URL` is used by the React client in `src/app/providers.tsx`.
- `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` is required by `convex/auth.config.ts` and is now also validated in `src/env.ts`.
- `PLAYWRIGHT_USERNAME` and `PLAYWRIGHT_PASSWORD` are for local Playwright/Codex UI automation and are documented in `AGENTS.md`.
- Playwright auth setup now uses Clerk's `@clerk/testing` helpers, so preview CI also needs `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` available to the test job.
- `PLAYWRIGHT_OWNER_ID` is the Convex/Clerk owner identifier used to seed the dedicated Playwright account on fresh preview deployments.
- `VERCEL_AUTOMATION_BYPASS_SECRET` is only needed when running Playwright against Vercel previews protected by Deployment Protection.
- `.env.example` is intended as the source of truth for local setup.

### 5. Start the app

In another terminal, run:

```bash
pnpm dev
```

Open `http://localhost:3000`.

The dashboard at `/` is visible without auth, but the rest of the product flow expects you to sign in.

## Scripts

```bash
pnpm dev         # start Next.js locally
pnpm build       # production build
pnpm start       # run the production server
pnpm lint        # ESLint
pnpm typecheck   # TypeScript checks
pnpm test        # Vitest run
pnpm test:watch  # Vitest watch mode
pnpm test:e2e    # Playwright end-to-end tests
pnpm test:e2e:setup # Playwright auth setup only
pnpm test:e2e:smoke # Preview-oriented Chromium smoke suite
pnpm test:e2e:ui # Playwright UI runner
pnpm vercel-build # Convex-backed Vercel build command with preview seeding
```

## Project structure

```text
.
├── convex/                 # Convex schema and backend functions
├── shared/imports/         # shared import types, constants, matching, validation
├── src/app/                # Next.js routes and page clients
├── src/components/         # app and UI components
├── src/lib/                # formatting, auth helpers, import parsers, utilities
└── src/styles/             # global styles
```

## Architecture notes

- There are no Next.js API routes in this app. Server-side data access lives in `convex/`.
- Most authenticated pages preload Convex data in a server component, then hand it to a client page via `preloadQuery`.
- The Convex schema currently includes `campaigns`, `tradePlans`, `trades`, `inboxTrades`, `portfolios`, `notes`, `strategyDoc`, and `accountMappings`.
- Imported trades land in `inboxTrades` first so they can be reviewed before becoming permanent `trades`.
- Open positions are derived from trades rather than stored as a separate source of truth.

## Testing

- Unit-style tests run through Vitest via `pnpm test`.
- Browser tests run through Playwright via `pnpm test:e2e`.
- The preview smoke suite is `pnpm test:e2e:smoke`; it expects `PLAYWRIGHT_BASE_URL` and optionally `VERCEL_AUTOMATION_BYPASS_SECRET` when targeting protected Vercel previews.
- `pnpm test:e2e:setup` now authenticates through Clerk's Playwright testing helpers rather than filling the sign-in UI manually.
- Vercel preview deployments should use `pnpm vercel-build` so Convex preview deployments get seeded through `--preview-run 'e2eSeed:setupPreviewData'`.
- This repo intentionally keeps both `@playwright/test` and `playwright` installed. Playwright generally recommends using only one top-level package, but the current Codex `playwright-interactive` workflow expects a direct `playwright` import while this repo's end-to-end tests run through `@playwright/test`.
- For app-focused Playwright work, start both `pnpm dev` and `pnpm convex dev` first.
- Playwright reuses `output/playwright/auth.json` when present; refresh it with `pnpm test:e2e:setup` if it goes stale.

## Useful routes

- `/` dashboard
- `/trades` trade journal and filters
- `/trades/new` manual trade entry
- `/trade-plans` trade plan management
- `/campaigns` campaign tracking
- `/imports` CSV import and inbox review
- `/positions` derived open positions
- `/portfolio` portfolio management
- `/notes` note management
- `/strategy` long-form strategy document
- `/accounts` brokerage account ID mapping
