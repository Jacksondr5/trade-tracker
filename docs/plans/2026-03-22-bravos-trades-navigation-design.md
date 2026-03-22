# Bravos Trades Navigation Design

## Summary

`JAC-151` adds a lower-priority navigation category for service-sourced trade plans. Any trade plan with a populated `sourceUrl` is treated as a Bravos trade and should appear outside the existing campaign and standalone buckets.

## Decisions

- Keep the existing `tradePlans` schema unchanged and derive the category from `sourceUrl`.
- Add a dedicated `Bravos` group to the local campaign/trade-plan hierarchy.
- Keep Bravos trade plans on the existing trade-plan detail route and workspace.
- Update the trade-plans index to expose a `Bravos` filter alongside the existing relationship filters.
- Reflect the new category in shared navigation helpers so breadcrumbs and command-palette context stay aligned.

## Scope

- Convex navigation hierarchy should return Bravos plans in a dedicated collection.
- Trade-plan workspace summaries should expose a derived relationship kind of `bravos`.
- The desktop local rail, simplified hierarchy navigation, breadcrumbs, and command palette should use the new category.
- The trade-plans index should filter Bravos plans separately from linked and standalone plans.

## Non-Goals

- No schema migration or new persisted category field.
- No trade-plan detail workflow changes beyond navigation context.
- No change to how Bravos plans are edited; removing `sourceUrl` should move a plan back to its non-Bravos category automatically.
