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

## [2026-03-22 15:12 EDT] Jacksondr5/trade-tracker PR #83 — Active import-tasks index for tray query
- Reason deferred: The current nit is valid, but fixing it cleanly needs a schema/query shape decision (for example, adding an explicit non-dismissed flag/index or an archival path) rather than a last-minute index guess on an optional timestamp field.
- PR comment: https://github.com/Jacksondr5/trade-tracker/pull/83#pullrequestreview-3988467262
- Suggested next step: Decide whether import task visibility should be modeled with a durable boolean/state column or archival flow, then add the matching indexed query path and migrate the tray to it.

## [2026-03-22 15:39 EDT] Jacksondr5/trade-tracker PR #83 — Recover abandoned browser-owned import tasks
- Reason deferred: This is a valid resilience concern, but the safe fix is a broader architecture change spanning durable server-owned execution or resumable pending-task handling with heartbeat/TTL semantics; that is larger than this review batch and would be risky to partially land here.
- PR comment: https://github.com/Jacksondr5/trade-tracker/pull/83#discussion_r2971971247
- Suggested next step: Design a server-owned import execution/recovery path (or explicit heartbeat + stale-task reaper), then update create/retry/list flows together so orphaned pending tasks can be surfaced, retried, or failed deterministically.
