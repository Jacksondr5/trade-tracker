# AGENTS.md

This file provides guidance to AI agents when working in this repository.
It is the canonical source for agent workflows, responsibilities, and repo-specific operating procedures; use `docs/product/README.md` for evergreen product and architecture guidance.

## Source Of Truth

Evergreen product and architecture guidance lives in `docs/product/`. If guidance in this file overlaps with `docs/product/`, follow the evergreen docs and do not restate or infer product intent from older plan documents.

Read `docs/product/README.md` in full first, then use your judgment to open only the additional evergreen doc or docs that match the task.

Use `docs/plans/` for dated feature plans, redesign proposals, implementation plans, and historical context.

## Linear Workflow

When an agent starts work on a Linear ticket in this repo:

- Move the ticket to `In Progress` when the work is picked up.
- Do not manually move the ticket to `In Review` or `Done`.
- Open the pull request and let the GitHub integration move the ticket to `In Review` when appropriate.
- Let the GitHub integration move the ticket to `Done` after the PR is merged or otherwise completes the configured workflow.

## Commands

```bash
pnpm dev          # Start Next.js dev server (Convex dev server should run separately: npx convex dev)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Vitest
pnpm test:e2e     # Playwright end-to-end tests
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

This repo uses Vitest for unit-style tests and Playwright for end-to-end tests. CI runs lint, typecheck, test, and build.

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

Use `playwright-interactive` first for UI work in this repo. It is the default because it keeps a persistent browser session alive through `js_repl`, which is better for iterative frontend development and repeated post-edit verification. Only fall back to `playwright` CLI if the interactive workflow fails, the `js_repl` session becomes unhealthy, or the task is intentionally a one-off CLI-style check. If you fallback, flag this to the user as an issue that needs to be fixed.

Shared rules:

- Start the app first: `pnpm dev` and `pnpm convex dev`
- If the agent starts Next.js itself, read the `pnpm dev` output and capture the actual local URL/port that Next assigned
- If the server is already running, verify the active local URL/port before opening Playwright; do not assume `3000`
- For Playwright-based work, prefer `127.0.0.1` over `localhost` when both are available
- Playwright credentials live in `.env.local` as `PLAYWRIGHT_USERNAME` and `PLAYWRIGHT_PASSWORD`
- Standard shared auth state file: `output/playwright/auth.json`
- Preferred auth refresh command: `pnpm test:e2e:setup`
- The Playwright auth setup uses Clerk's `@clerk/testing` helpers and requires `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` alongside the Playwright credentials
- Try loading saved auth state first, but if the app is not running on the same origin the saved auth may not restore cleanly

### `playwright-interactive` Default

Use this first for UI tasks, especially when the agent expects to make code edits and re-check the UI multiple times in the same task.

- Start each new interactive workflow from a clean `js_repl` state so stale `browser`, `context`, or `page` handles do not leak across tasks
- After resetting `js_repl`, rerun the Playwright bootstrap/setup cells before interacting with the app
- Reuse the same live `browser`, `context`, and `page` handles across checks instead of reopening the browser repeatedly
- Set the interactive target URL from the actual running Next.js port before calling `page.goto(...)`
- Load `output/playwright/auth.json` into the browser context before rerunning `pnpm test:e2e:setup` or falling back to manual Clerk login
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

If the saved auth file is missing or no longer valid, prefer refreshing it with:

```bash
pnpm test:e2e:setup
```

Notes:

- `playwright` CLI and `playwright-interactive` can share the same `output/playwright/auth.json` file
- The saved auth state is sensitive; keep it local and do not commit it
- If auth restoration behaves unexpectedly, confirm the agent is using the correct detected origin because cookies are origin-specific
