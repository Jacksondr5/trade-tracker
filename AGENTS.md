# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Trade Tracker is a trading journal app for recording and analyzing trades across stocks and crypto. It supports thesis-driven campaigns, campaign notes, and optional trade-plan linkage for execution tracking. Built with Next.js 15 (App Router), Convex (serverless backend/database), and Clerk (authentication).

## Product Documentation

Evergreen product docs live in `docs/product/`. Use these for current product-wide guidance such as vision, principles, information architecture, UX principles, roadmap, and related foundation documents.

Use `docs/plans/` for dated feature plans, implementation plans, redesign proposals, and historical context about how the product has evolved over time.

## Commands

```bash
pnpm dev          # Start Next.js dev server (Convex dev server should run separately: npx convex dev)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Vitest
pnpm test:e2e     # Playwright end-to-end tests
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

This repo uses Vitest for unit-style tests and Playwright for end-to-end browser tests. CI runs lint, typecheck, test, and build.

## Worktree Bootstrap

New Git worktrees in this repo may be missing `.env.local` and `node_modules/` when they are first created. Before running the app, Playwright, or project scripts, agents must verify that both exist and bootstrap the worktree if needed.

Bootstrap rules:

- If `.env.local` is missing, copy it from the primary checkout. Find that path with `git worktree list` and copy the file from the main checkout.
- If `node_modules/` is missing, run `pnpm install` from the worktree root.
- Do not overwrite an existing `.env.local` unless the user explicitly asks for that.

Suggested commands:

```bash
git worktree list
cp [path/to/main/checkout] .env.local
pnpm install
```

## Playwright Testing

Use `playwright-interactive` first for UI work in this repo. It is the default because it keeps a persistent browser session alive through `js_repl`, which is better for iterative frontend development and repeated post-edit verification. Only fall back to `playwright` CLI if the interactive workflow fails, the `js_repl` session becomes unhealthy, or the task is intentionally a one-off CLI-style check.  If you fallback, flag this to the user as an issue that needs to be fixed.

Shared rules:

- Start the app first: `pnpm dev` and `pnpm convex dev`
- If the agent starts Next.js itself, read the `pnpm dev` output and capture the actual local URL/port that Next assigned
- If the server is already running, verify the active local URL/port before opening Playwright; do not assume `3000`
- For Playwright-based work, prefer `127.0.0.1` over `localhost` when both are available
- Playwright credentials live in `.env.local` as `PLAYWRIGHT_USERNAME` and `PLAYWRIGHT_PASSWORD`
- Standard shared auth state file: `output/playwright/auth.json`
- Try loading saved auth state before doing a manual Clerk login, but if the app is not running on the same origin the saved auth may not restore cleanly

Clerk sign-in currently uses a two-step flow for the Playwright account when auth state is missing or expired:

1. Enter `PLAYWRIGHT_USERNAME` on `/sign-in`
2. Submit, then enter `PLAYWRIGHT_PASSWORD` on `/sign-in/factor-one`

### `playwright-interactive` Default

Use this first for UI tasks, especially when the agent expects to make code edits and re-check the UI multiple times in the same task.

- Start each new interactive workflow from a clean `js_repl` state so stale `browser`, `context`, or `page` handles do not leak across tasks
- After resetting `js_repl`, rerun the Playwright bootstrap/setup cells before interacting with the app
- Reuse the same live `browser`, `context`, and `page` handles across checks instead of reopening the browser repeatedly
- Set the interactive target URL from the actual running Next.js port before calling `page.goto(...)`
- Load `output/playwright/auth.json` into the browser context before falling back to manual Clerk login
- Save refreshed auth state back to `output/playwright/auth.json` after a manual login succeeds

```js
var TARGET_URL = "http://127.0.0.1:3000"; // Replace with the actual detected local URL.

await context.storageState({ path: "output/playwright/auth.json" });

context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  storageState: "output/playwright/auth.json",
});
page = await context.newPage();
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
```

### `playwright` CLI Fallback

Use this only if `playwright-interactive` fails, the `js_repl` session is unavailable, or the interactive browser state becomes unhealthy.

- Invoke the skill wrapper directly: `"$HOME/.codex/skills/playwright/scripts/playwright_cli.sh"`
- The wrapper must be executable; if direct execution fails, fix the file permissions before continuing
- Use the actual detected local URL in every CLI command; do not hardcode `3000` if Next started on another port
- Prefer headed mode for local debugging
- Always take a fresh `snapshot` before using element refs like `e47`
- Save screenshots with `--filename`; do not pass the output path as the positional argument:
  `"$PWCLI" -s=default screenshot --filename output/playwright/example.png`
- Load `output/playwright/auth.json` before doing a manual login if the file exists

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
export APP_URL="http://127.0.0.1:3000" # Replace with the actual detected local URL.
source .env.local

"$PWCLI" open "$APP_URL" --headed
"$PWCLI" state-load output/playwright/auth.json
"$PWCLI" goto "$APP_URL"
"$PWCLI" snapshot
```

If the saved auth file is missing or no longer valid, complete the manual Clerk login once and then refresh the shared state:

```bash
"$PWCLI" state-save output/playwright/auth.json
```

Notes:

- `playwright` CLI and `playwright-interactive` can share the same `output/playwright/auth.json` file
- The saved auth state is sensitive; keep it local and do not commit it
- If auth restoration behaves unexpectedly, confirm the agent is using the correct detected origin because cookies are origin-specific

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
