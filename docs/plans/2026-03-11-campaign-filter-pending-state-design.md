# Campaign Filter Pending State Design

## Goal

Smooth the campaign index filter transition so quick status changes do not flash the full loading UI before the next result set appears.

## Constraints

- Keep scope limited to `src/app/(app)/campaigns/CampaignsPageClient.tsx`.
- Preserve the current filter semantics and Convex query behavior.
- Keep the interaction aligned with the existing dark visual system.
- Avoid introducing a heavyweight table overlay or a full skeleton swap for ordinary filter changes.

## Decisions

### Preserve the previous results while loading

When the user selects a new status filter, keep the last resolved campaign rows visible until the new query resolves.

This prevents the current hard swap from table to loading card and removes the flash on fast responses.

### Use combined pending feedback

Show pending state in two places:

- the selected filter button enters a muted pending-selected state with a subtle animated outline spark
- the table remains visible but receives a subtle updating treatment

The table treatment should be restrained:

- slightly lower contrast
- brief “Updating campaigns…” label near the table header area
- no opaque full-screen mask

The button treatment should also stay restrained:

- no label movement
- no icon insertion that changes button layout
- no loud glow or decorative particle effects
- the animation should read like a refined border sweep rather than a celebration effect

### Empty state only after resolution

Do not replace the previous rows with the empty state until the new filter query has actually resolved with zero campaigns.

## Verification

- `pnpm lint`
- `pnpm typecheck`
- browser spot-check on `/campaigns` while switching between status filters
