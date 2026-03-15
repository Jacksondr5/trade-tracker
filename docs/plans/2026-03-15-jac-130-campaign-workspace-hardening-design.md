# Campaign Workspace Hardening Design

## Goal

Leave the campaign workspace in a stronger technical state by replacing residual route-local UI drift on touched campaign surfaces with shared primitives and by adding focused regression coverage for the campaign list and detail flows.

## Constraints

- Follow [docs/product/content-and-copy-principles.md](../product/content-and-copy-principles.md), [docs/product/navigation-model.md](../product/navigation-model.md), [docs/product/technical-architecture-overview.md](../product/technical-architecture-overview.md), and [docs/product/ux-principles.md](../product/ux-principles.md).
- Keep this ticket scoped to cleanup and hardening of the existing campaign workspace behavior.
- Reuse or extend `src/components/ui/` before adding route-local controls.
- Add only the regression coverage needed for the main campaign list/detail paths touched by the redesign work.

## Decisions

### Shared form control cleanup

Add a shared select primitive that matches the current shared input and textarea system. Use it for the campaign status selector and the linked trade-plan status selectors on the campaign detail page so those controls stop owning local markup and token choices.

### Shared watch affordance

Move the campaign detail watch toggle onto the same shared interaction pattern already used by the hierarchy rail. The detail page should keep the watch action near the title, but it should not define a second watch-button style locally.

### Copy and touched control alignment

Keep touched labels and helper copy calm and explicit:

- use sentence case for button labels
- avoid generic toggles like `Hide Form`
- keep empty and status messaging factual

This is a cleanup pass, not a rewrite of the campaign detail information architecture.

### Regression coverage

Strengthen deterministic coverage in two places:

- backend tests for campaign workspace summaries and lifecycle-filter behavior
- Playwright smoke coverage for seeded campaign list/detail flows, including lifecycle filtering and clear-filter recovery

Extend the existing deterministic Playwright seed instead of making the browser suite create extra fixture data at runtime.

## Verification

- `pnpm test convex/campaigns.test.ts`
- `pnpm test tests/e2e/smoke/campaigns.spec.ts` or the repo-equivalent targeted Playwright invocation
- `pnpm lint`
- `pnpm typecheck`
