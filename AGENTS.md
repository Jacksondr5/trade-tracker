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
- ALWAYS do ticket work on a new git worktree, EXCEPT when the session is already running inside a `t3code` worktree (paths under `~/.t3/worktrees/`). In that case the t3code worktree itself is the dedicated worktree for the task — create a new branch inside it instead of nesting another worktree under it. Run `git worktree list` and compare it to the current working directory before deciding.
- Open the pull request and let the GitHub integration move the ticket to `In Review` when appropriate.
- Let the GitHub integration move the ticket to `Done` after the PR is merged or otherwise completes the configured workflow.

## Commands

```bash
pnpm agent:down   # Stop this worktree's recorded local environment
pnpm agent:up     # Provision and start this worktree's isolated local environment
pnpm dev          # Start Next.js only (normally use agent:up instead)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Vitest
pnpm test:e2e     # Playwright end-to-end tests
pnpm typecheck    # TypeScript type checking (tsc --noEmit)
```

This repo uses Vitest for unit-style tests and Playwright for end-to-end tests. CI runs lint, typecheck, test, and build.

## Worktree Bootstrap

New Git worktrees may be missing `.env.local`, `node_modules/`, and a Convex deployment. Bootstrap and start all three with one command:

```bash
pnpm agent:up & # First invocation is long-running; keep this shell/session alive.
pnpm agent:up   # Second invocation prints the exact endpoints and exits.
```

The first `agent:up` invocation supervises Convex and Next.js in the foreground, so launch it as a backgrounded or long-running terminal process and leave that process running. It installs dependencies when needed, bootstraps local secrets without retaining another checkout's Convex binding, assigns deterministic ports from the worktree path, selects a worktree-local Convex backend, and waits for both services to be ready. A second foreground invocation is the authoritative way to print the exact app origin, Convex URL, and origin-keyed Playwright auth-state path; it exits immediately when the supervised environment is healthy.

On a cold worktree, the second invocation can remain in the foreground while the first invocation installs and provisions. This is expected: leave the first supervisor running and wait for the second invocation to print the endpoints. Do not run `agent:down` merely because the second invocation is still waiting during provisioning.

Stop the recorded environment with `pnpm agent:down`. `agent:up` automatically recovers a stale `output/agent/runtime.json` lease when it can prove ownership of the recorded child process. If a different process owns one of the deterministic ports, it refuses to start and prints the conflicting ports instead of treating that process as healthy.

Do not copy `.env.local` manually or run reset/seed commands against a deployment inherited from another checkout. Local Playwright setup refuses to reset data unless `.env.local` and `.convex/local/default` identify the same worktree-local backend.

## Playwright Testing

When the harness provides `js_repl`, use `playwright-interactive` first for UI work in this repo. It is the Codex default because it keeps a persistent browser session alive, which is better for iterative frontend development and repeated post-edit verification. Harnesses without `js_repl` should use the `playwright` CLI skill directly; that is expected behavior, not a fallback failure. When `js_repl` is available, fall back to the CLI only if the interactive workflow fails, the session becomes unhealthy, or the task is intentionally a one-off CLI-style check. If an available interactive workflow fails, flag that failure to the user.

Shared rules:

- Start the complete local environment with `pnpm agent:up`; use the exact app origin, Convex URL, and auth-state path it prints
- `agent:up` also writes `APP_URL`, `PLAYWRIGHT_BASE_URL`, and `PLAYWRIGHT_AUTH_FILE` to this worktree's `.env.local`; do not substitute another host or port
- Playwright credentials live in `.env.local` as `PLAYWRIGHT_USERNAME` and `PLAYWRIGHT_PASSWORD`
- Playwright auth state is keyed by the complete app origin under `output/playwright/auth/`
- Preferred auth refresh command: `pnpm test:e2e:setup`; setup discards and regenerates missing, corrupt, expired, or origin-mismatched state before authenticated tests run
- The Playwright auth setup uses Clerk's `@clerk/testing` helpers and requires `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_CLERK_FRONTEND_API_URL` alongside the Playwright credentials

### Selector And Testing Contract

- The evergreen selector contract lives in `docs/product/technical-architecture-overview.md`. Follow that doc if guidance diverges from older plan documents.
- App-owned Playwright specs and helper functions must use exact `getByTestId()` selectors only.
- Do not add new selectors that rely on visible copy, headings, labels, generic table text, CSS classes, or DOM position.
- Prefer semantic fixed ids such as `nav-trades-link` or `campaign-name-input` for stable controls.
- Prefer dynamic ids when the record id is the stable lookup key, such as `campaign-row-<id>` or `trade-row-<id>`. If the test must target deterministic seeded fixture content before it knows the backend id, use a normalized semantic key that the fixture controls.
- Treat `data-testid` values used by Playwright as a compatibility contract. Update helpers and specs in the same change when a hook changes.
- Third-party surfaces the repo does not own, such as Clerk auth, are the only routine exception. Keep those selectors isolated in setup helpers rather than spreading them through specs.
- Shared Playwright helpers should encode selector lookups so specs do not duplicate raw test id strings.
- The default local data model is deterministic suite-level reset and seed for the dedicated Playwright user before authenticated specs run. Tests that create or mutate data should use dedicated helpers or clean up their own side effects.
- `tests/e2e/setup/global.setup.ts` is responsible for local reset/seed before specs execute.

### `playwright-interactive` Default

Use this first for UI tasks, especially when the agent expects to make code edits and re-check the UI multiple times in the same task.

- Start each new interactive workflow from a clean `js_repl` state so stale `browser`, `context`, or `page` handles do not leak across tasks
- After resetting `js_repl`, rerun the Playwright bootstrap/setup cells before interacting with the app
- Reuse the same live `browser`, `context`, and `page` handles across checks instead of reopening the browser repeatedly
- Set the interactive target URL and auth-state path to the exact values printed by `pnpm agent:up`
- Run `pnpm test:e2e:setup` before loading state when the printed auth-state file is missing or invalid
- Save refreshed auth state back to the printed origin-keyed path after a manual login succeeds

```js
var TARGET_URL = "<App origin printed by pnpm agent:up>";
var AUTH_STATE_FILE = "<Playwright auth state path printed by pnpm agent:up>";

context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  storageState: AUTH_STATE_FILE,
});
page = await context.newPage();
await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

// Run this only after a manual login succeeds in this live context.
// await context.storageState({ path: AUTH_STATE_FILE });
```

### `playwright` CLI Workflow

Use this directly on harnesses without `js_repl`. On harnesses with `js_repl`, use it if `playwright-interactive` fails, the interactive browser state becomes unhealthy, or the task is intentionally a one-off CLI-style check.

- Invoke the shared skill wrapper directly: `"$HOME/.agents/skills/playwright/scripts/playwright_cli.sh"`
- The wrapper must be executable; if direct execution fails, fix the file permissions before continuing
- Use the app origin printed by `pnpm agent:up` in every CLI command
- Prefer headed mode for local debugging
- Always take a fresh `snapshot` before using element refs like `e47`
- Save screenshots with `--filename`; do not pass the output path as the positional argument:
  `"$PWCLI" -s=default screenshot --filename output/playwright/example.png`
- Load `$PLAYWRIGHT_AUTH_FILE` before doing a manual login if the file exists

```bash
export PWCLI="$HOME/.agents/skills/playwright/scripts/playwright_cli.sh"
source .env.local

"$PWCLI" open "$APP_URL" --headed
"$PWCLI" state-load "$PLAYWRIGHT_AUTH_FILE"
"$PWCLI" goto "$APP_URL"
"$PWCLI" snapshot
```

If the saved auth file is missing or no longer valid, prefer refreshing it with:

```bash
pnpm test:e2e:setup
```

Notes:

- `playwright` CLI and `playwright-interactive` can share the origin-keyed file printed by `pnpm agent:up`
- The saved auth state is sensitive; keep it local and do not commit it
- If auth restoration behaves unexpectedly, rerun `pnpm test:e2e:setup`; it refreshes state for the configured origin

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Shared Agent Skills

Convex agent skills are intentionally installed at user scope through the shared `npx skills` store, not inside this repository. The empty `aiFiles.skills.agents` list in `convex.json` prevents `npx convex dev` and `npx convex ai-files install` from recreating repo-local skill copies. Accordingly, `npx convex ai-files status` may report that agent skills are not installed even though the approved global skills are available; do not “fix” that warning by adding repo-local agents. Continue using `npx convex ai-files update` to refresh the generated guidelines and managed documentation section.

The user-scoped Convex catalog is curated separately from this repository; `npx convex ai-files install` does not install it while `aiFiles.skills.agents` is empty. Verify the approved home-level selection with `npx skills ls -g`. Do not run `npx skills add get-convex/agent-skills --all --global`: the full upstream bundle includes intentionally excluded broad, noisy, and unavailable workflows.

The generated guidelines show Convex's newer table-scoped database calls, but existing two-argument calls such as `ctx.db.patch(id, value)` and `ctx.db.delete(id)` remain valid in this repository. Preserve the surrounding module's established form; do not convert call sites opportunistically in unrelated changes.
