# Follow-up Items (PR #20)

## 1) Import dedup scalability in `convex/imports.ts`
Current `importTrades` dedup flow performs owner-wide collection passes against existing trades and pending inbox trades. This is functionally correct, but may become expensive with larger datasets.

**Suggested follow-up:**
- Move toward tighter indexed lookups for dedup checks where possible.
- Consider incremental/batched import dedup strategies to avoid broad owner-wide scans.

## 2) Portfolio detail campaign-linkage scaling
Portfolio detail campaign linkage currently relies on multiple read paths (including per-tradePlan/per-campaign access patterns), with caching helping but still potentially expensive at larger scale.

**Suggested follow-up:**
- Introduce more batched lookup patterns for campaign linkage computation.
- Consider pre-aggregated/denormalized summaries if portfolio data volume grows.

## 3) Shared pending-control treatment
The campaign filter now uses a pulsing pending outline that would likely be useful in other places, especially navigation controls and non-blocking save/update actions. The current implementation is route-local and should not stay that way if the pattern spreads.

**Suggested follow-up:**
- Extract the pending outline treatment into the shared UI layer instead of keeping it inside `src/app/(app)/campaigns/CampaignsPageClient.tsx`.
- Keep it opt-in rather than replacing the existing `Button` loading-spinner behavior globally.
- Design the shared API so both `Button`-based actions and link-like navigation controls can adopt the same pending treatment.
