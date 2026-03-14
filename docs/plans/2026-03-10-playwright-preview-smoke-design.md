# Playwright Preview Smoke Design

## Overview

Trade Tracker needs browser-level coverage for the flows that matter most in pull requests, but the first step should stay narrow and operationally simple. The initial end-to-end strategy will run Playwright against the real Vercel preview deployment for each PR after Vercel and Convex have finished standing up the preview environment.

This is intentionally a preview-first smoke suite, not a broad regression suite. The goal is to catch deployment-wiring problems and obvious user-facing breakage while preserving the deployed preview so failures can be inspected after the run.

## Goals

- Run a small Playwright smoke suite against each PR preview deployment.
- Use the actual Vercel preview URL rather than a locally booted CI app.
- Seed fresh Convex preview deployments with deterministic smoke-test data.
- Reuse authenticated Playwright state so specs focus on app behavior after auth.
- Keep the preview environment available after failure for manual debugging.

## Non-Goals

- Full browser regression coverage for every route and mutation.
- Import inbox coverage in phase 1.
- Real Clerk sign-in coverage as part of every smoke run.
- Cross-browser matrix testing in phase 1.
- A local ephemeral CI app stack for browser tests.

## Why Start With Preview-First

The repo already deploys Vercel and Convex previews on PR pushes. Using those deployments first gives the team signal on the actual hosted app path instead of only validating a synthetic CI runtime.

This approach is useful now because it validates:

- Vercel preview readiness and routing
- Convex preview deployment wiring
- Clerk, Convex, and Next.js integration in the hosted environment
- asset loading and client hydration in the real preview
- post-failure debugging against a still-live environment

The tradeoff is lower determinism than a locally booted stack. That is acceptable for a narrow smoke suite, but it should not be treated as the forever home for comprehensive browser coverage.

## Vendor-Native Triggering

The workflow should use Vercel's GitHub `repository_dispatch` integration rather than custom polling or a hand-rolled deployment waiter.

Recommended trigger model:

- GitHub Actions workflow listens for `repository_dispatch`
- Filter event type to Vercel preview-ready events, ideally `vercel.deployment.ready`
- Read the preview URL from `github.event.client_payload.url`
- Skip non-preview environments
- Keep `workflow_dispatch` enabled for manual validation while the pipeline is being built out

Important constraint:

- The workflow file must exist on the default branch for the `repository_dispatch` trigger to fire consistently

## Vendor-Native Convex Seeding

The workflow should not seed data from the Playwright runner. Convex already supports preview-deploy hooks, and that should be the first mechanism used.

Recommended seeding model:

- Create a dedicated Convex seed function such as `e2eSeed.setupPreviewData`
- Invoke it from preview deploys using `npx convex deploy --preview-run 'e2eSeed.setupPreviewData'`
- Keep the seed routine idempotent for the dedicated Playwright user
- Restrict the seeded dataset to the minimum required smoke fixtures

Why this shape:

- seed logic lives with application code and schema changes
- seeded data matches the exact preview deployment under test
- reruns do not require a separate seed orchestration layer

## Preview Protection

If Vercel preview protection is enabled, the workflow must use Vercel Protection Bypass for Automation. This should be treated as required infrastructure for preview-based E2E rather than a nice-to-have.

Required setup:

- enable Protection Bypass for Automation in Vercel
- store the bypass secret in GitHub Actions secrets
- configure Playwright requests for the preview URL to use the bypass mechanism

Without this, preview tests are vulnerable to false failures that have nothing to do with the app.

## Test Data Strategy

Phase 1 should use a deliberately small synthetic workspace for one dedicated Playwright user. The seed should be easy to understand by inspection and stable across reruns.

Seeded smoke data should include:

- 1 campaign
- 2 trade plans
  - 1 linked to the campaign
  - 1 standalone trade plan
- watchlist entries that make the hierarchy and watched state visible
- a few trades that produce coherent positions output
- the minimum portfolio and account-mapping records needed for in-scope pages

The seed should avoid:

- large or realistic-looking data volume
- date values based on the current day
- fixtures that require imports processing

All names should be obviously synthetic so the preview environment is easy to inspect after failure.

## Auth Strategy

Phase 1 should not use the Clerk UI login flow as the setup path for every spec.

Recommended auth model:

- a Playwright setup project or global setup authenticates the dedicated test user
- authenticated state is saved to `output/playwright/auth.json`
- smoke specs reuse that stored state
- auth setup should fail clearly if the account credentials or preview access are broken

Follow-up scope, not phase 1:

- add one separate real sign-in smoke test to cover the Clerk flow directly

This keeps app regressions separate from auth regressions and makes local agent-driven reruns faster.

## Smoke Suite Scope

Phase 1 smoke coverage should stay intentionally small:

- app shell loads for the authenticated user
- campaigns list and campaign detail render correctly
- trade plans list and trade plan detail render correctly
- hierarchy and watchlist navigation show the seeded relationships
- one lightweight create or edit workflow succeeds
- trades and positions reflect the seeded trade data coherently

Explicitly deferred:

- imports inbox
- broad CRUD coverage across every route
- stress cases and large-data navigation
- browser matrix expansion beyond Chromium

## Reliability Guardrails

Preview-first E2E can become noisy quickly, so the first version needs firm boundaries.

Guardrails:

- Chromium only in phase 1
- stable `data-testid` selectors for interactive elements
- fixed fixture names and fixed dates
- idempotent Convex seed behavior
- shared auth state rather than repeated UI logins
- Playwright traces, screenshots, and video retained on failure
- fail-fast setup when preview URL, bypass configuration, or auth setup is invalid
- keep most smoke tests read-heavy so the preview stays inspectable after failure

## Risks And Failure Modes

- Vercel dispatch timing or event filtering mistakes prevent the workflow from running
- preview protection is configured but the automation bypass is missing or incorrect
- Convex seed logic drifts as schema changes land
- tests mutate shared preview data in ways that make reruns noisy
- loading-state timing causes assertions to fire too early

These are manageable if the suite stays small and the seed remains explicit and versioned.

## Follow-Up Work

Likely follow-up phases after the preview-first smoke suite proves useful:

- add a dedicated real Clerk sign-in smoke test
- widen smoke coverage to more mutation flows
- add import coverage once the simpler suite is stable
- add a deterministic CI/local-stack browser suite when preview-first reaches its reliability ceiling

## External References

- Vercel for GitHub: https://vercel.com/docs/git/vercel-for-github
- Vercel repository dispatch deployment events: https://vercel.com/changelog/trigger-github-actions-with-enriched-deployment-data-from-vercel
- Vercel Protection Bypass for Automation: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
- Convex with Vercel: https://docs.convex.dev/production/hosting/vercel
- Convex CLI: https://docs.convex.dev/cli
