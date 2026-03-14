# Playwright Preview Smoke Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a preview-triggered Playwright smoke suite that runs against Vercel PR deployments, uses vendor-native Convex preview seeding, reuses authenticated state, and validates a small set of critical post-auth flows.

**Architecture:** Trigger GitHub Actions from Vercel's preview-ready `repository_dispatch` event, seed the PR's fresh Convex deployment during preview deploy with a small idempotent dataset, then run Playwright smoke tests against the Vercel preview URL using protection bypass and stored auth state. Keep phase 1 Chromium-only and intentionally narrow.

**Tech Stack:** GitHub Actions, Vercel preview deployments, Convex preview deploy hooks, Playwright, Clerk, Next.js App Router

---

### Task 1: Save the approved strategy docs

**Files:**
- Create: `docs/plans/2026-03-10-playwright-preview-smoke-design.md`
- Create: `docs/plans/2026-03-10-playwright-preview-smoke-implementation.md`

**Step 1: Save the design doc**

Write the approved preview-first scope, vendor-native trigger/seeding strategy, auth approach, and guardrails into the design doc.

**Step 2: Save the implementation plan**

Write the execution handoff plan with exact file targets and verification steps.

**Step 3: Commit the docs**

Run:

```bash
git add docs/plans/2026-03-10-playwright-preview-smoke-design.md docs/plans/2026-03-10-playwright-preview-smoke-implementation.md
git commit -m "docs: add playwright preview smoke testing plan"
```

Expected: a docs-only commit is created.

### Task 2: Add the preview-triggered GitHub Actions workflow

**Files:**
- Create: `.github/workflows/preview-e2e.yml`
- Modify: `.github/workflows/ci.yml`
- Test: `.github/workflows/preview-e2e.yml`

**Step 1: Create the preview E2E workflow skeleton**

Add a workflow that listens to:

- `repository_dispatch`
- `workflow_dispatch`

Filter the `repository_dispatch` path to Vercel preview-ready events only.

**Step 2: Read preview metadata from the Vercel payload**

Use `github.event.client_payload.url` and related payload fields to determine:

- preview URL
- environment type
- commit or PR metadata for logging

Fail clearly if the URL is missing.

**Step 3: Add Playwright job setup**

Install dependencies, browsers, and any required environment wiring for the E2E run.

**Step 4: Keep existing CI unchanged except for documentation or cross-links**

Do not mix the preview workflow into the existing lint/typecheck/unit-test job until the preview pipeline is proven stable.

**Step 5: Validate workflow syntax**

Run:

```bash
pnpm exec prettier --check .github/workflows/preview-e2e.yml
```

Expected: workflow YAML passes formatting and basic structure review.

### Task 3: Add Convex preview seed support

**Files:**
- Create: `convex/e2eSeed.ts`
- Modify: Convex deploy config or project deployment command source as needed for preview deploys
- Test: `convex/e2eSeed.ts`

**Step 1: Create the seed function**

Add a Convex mutation or action that creates the dedicated smoke dataset for the Playwright user.

Seed only:

- one campaign
- one linked trade plan
- one standalone trade plan
- watchlist entries
- a small trades/positions-supporting dataset
- minimal portfolio/account mapping records if needed

**Step 2: Make the seed idempotent**

Ensure rerunning the seed does not duplicate records. Use stable names and lookup logic before inserts.

**Step 3: Wire the function into preview deploys**

Update the preview deploy command to use Convex's `--preview-run` hook with the new seed function.

**Step 4: Verify seed behavior locally against a non-production deployment**

Run the seed twice against a safe deployment and confirm record counts stay stable.

Expected: second run reuses or updates the same smoke fixture set instead of duplicating it.

### Task 4: Add Playwright preview config and authenticated setup

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/setup/auth.setup.ts`
- Create: `tests/e2e/helpers/env.ts`
- Create: `tests/e2e/helpers/auth.ts`
- Create: `tests/e2e/helpers/selectors.ts`
- Modify or replace: `tests/example.spec.ts`

**Step 1: Restructure Playwright test layout**

Move from the generated example spec to a project layout that supports:

- setup/auth project
- smoke project
- shared helpers

**Step 2: Configure preview URL and artifacts**

Read preview URL, protection-bypass inputs, and credentials from environment variables.

Configure:

- Chromium-only project
- trace retention
- screenshot or video on failure
- storage state reuse

**Step 3: Implement auth setup**

Create a setup test that authenticates the dedicated Playwright user and saves `output/playwright/auth.json`.

Do not test the full Clerk sign-in flow as a primary spec yet; treat this as test setup.

**Step 4: Fail fast on missing configuration**

Add helper validation so missing preview URL, credentials, or bypass configuration causes a clear setup failure.

**Step 5: Run the setup path locally against a valid preview or local environment**

Run:

```bash
pnpm test:e2e --grep @auth-setup
```

Expected: the auth setup succeeds and writes `output/playwright/auth.json`.

### Task 5: Implement the phase-1 smoke specs

**Files:**
- Create: `tests/e2e/smoke/app-shell.spec.ts`
- Create: `tests/e2e/smoke/campaigns.spec.ts`
- Create: `tests/e2e/smoke/trade-plans.spec.ts`
- Create: `tests/e2e/smoke/trades-positions.spec.ts`
- Modify app files only if missing stable selectors are discovered during implementation

**Step 1: Add the shell smoke spec**

Verify the authenticated app shell loads and key primary navigation is visible.

**Step 2: Add campaign smoke coverage**

Verify the seeded campaign appears in the list and detail navigation works.

**Step 3: Add trade plan and hierarchy smoke coverage**

Verify the linked and standalone trade plans appear in the correct navigation groups and detail routes work.

**Step 4: Add trades/positions smoke coverage**

Verify the seeded trade records and resulting positions render coherently.

**Step 5: Add one lightweight mutation smoke case**

Choose one low-risk create or edit path and verify it succeeds without making the rest of the seeded preview unusable for debugging.

**Step 6: Run the smoke suite locally or against a safe preview**

Run:

```bash
pnpm test:e2e
```

Expected: Chromium smoke suite passes with authenticated setup and artifact capture enabled.

### Task 6: Add Vercel protection bypass support to the workflow

**Files:**
- Modify: `.github/workflows/preview-e2e.yml`
- Modify: `tests/e2e/helpers/env.ts`
- Test: `.github/workflows/preview-e2e.yml`

**Step 1: Define workflow secrets contract**

Document and read the required GitHub Actions secrets for:

- preview protection bypass
- Playwright username
- Playwright password

**Step 2: Pass bypass configuration into the Playwright run**

Ensure the workflow exports the bypass inputs in the format expected by the Playwright helper layer.

**Step 3: Add explicit failure logging**

If the preview returns protection or auth failures, surface that clearly in job output before tests fan out.

**Step 4: Validate with a manual workflow dispatch**

Run the workflow against a known preview URL and confirm protected previews are reachable by automation.

### Task 7: Document how engineers and agents use the preview suite

**Files:**
- Modify: `AGENTS.md`
- Modify optional repo docs if there is a dedicated testing section

**Step 1: Document when to use preview E2E**

Add concise instructions for:

- waiting for preview readiness
- required secrets and env vars
- where auth state is stored
- how local agents rerun smoke tests against a preview

**Step 2: Document what is intentionally out of scope**

State that phase 1 excludes imports, browser matrix expansion, and the real Clerk sign-in test.

### Task 8: Run final validation and capture follow-ups

**Files:**
- Modify only if verification reveals issues

**Step 1: Run lint**

Run:

```bash
pnpm lint
```

Expected: lint passes.

**Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: typecheck passes.

**Step 3: Run unit tests**

Run:

```bash
pnpm test
```

Expected: existing unit and Convex tests still pass.

**Step 4: Run Playwright smoke validation**

Run:

```bash
pnpm test:e2e
```

Expected: preview smoke suite passes against a valid preview deployment.

**Step 5: Record known follow-ups**

Create follow-up issues for:

- real Clerk sign-in smoke coverage
- imports inbox E2E coverage
- cross-browser expansion
- eventual deterministic local-stack browser suite if preview-first becomes insufficient
