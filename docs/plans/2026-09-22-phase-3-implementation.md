# Phase 3 Implementation: Instrument Thread Model

Date: 2026-09-22
Status: implemented on branch `phase-3-instrument-thread-model`; this document records the implementation decisions and the counterpart tool contract for review.

Design: [2026-09-21-phase-3-instrument-thread-model-design.md](2026-09-21-phase-3-instrument-thread-model-design.md). Product guidance applied on 2026-09-22: element kinds stay a free string, trade plans stay dormant, Desk and Threads join navigation next to Trades, and the desk never shows owed-work counters.

## Data Model

New tables in `convex/schema.ts`:

| Table | Role |
| --- | --- |
| `instrumentThreads` | One per owner and ticker. Permanent. Created automatically from trades, ticker-tagged notes, campaign links, or the counterpart. |
| `episodes` | One position lifecycle in one portfolio under a thread. Carries `lifecycle` (inferred), `portfolioId`, `direction`, `source`, `campaignId`, `campaignElementExemptions`, `currentPlanVersionId`, `shelvedAt`, a reserved `retrospective` slot, and a `revision`. |
| `planElements` | The event stream. Scoped to an episode or a campaign. Each has `statement`, `status`, `author`, `actor`, `source`, optional `kind`, `value`, `asOf`, `noteId`, `supersededById`, `statusEvidence`, and two revisions: `revision` (creation order) and `statusRevision` (last status change). |
| `planVersions` | Versioned plan snapshots per episode: `versionNumber`, `revision`, `compiledThroughRevision`, `endorsed`, `endorsedAt`, `endorsedBy`, `draftedBy`, `source`, and six fixed `sections`. |
| `revisionCounters` | Per-owner monotonic revision sequence so ordering never uses date arithmetic. |
| `counterpartOperations` | Idempotency ledger keyed by `operationId`. |

Existing tables gained: `campaigns.benchmarkThreadId` and `campaigns.linkedThreadIds`; `notes.threadId` and `notes.episodeId`; `trades.episodeId`; `watchlist` thread and episode targets; `brokerageReconciliationIssues.lastRecheckedAt`. `tradePlans` and every `tradePlanId` field stay in place, dormant.

### Actor, author, source, endorser

Every write records who authored the statement (`author`: user or counterpart), who performed the write (`actor`: user, counterpart, agent, system), and which channel produced it (`source`: conversation, app, migration, trade_history). Endorsement is recorded only on plan versions and is always `endorsedBy: "user"`; the actor who relayed it is separate. A migration agent's writes carry `actor: "agent"` and can never endorse.

### Element value shape

```json
{
  "amount": 875,
  "unit": "usd" | "shares" | "percent" | "ratio",
  "scope": "per_share" | "position" | "portfolio",
  "provenance": "hypothetical" | "user_reported" | "broker_verified",
  "stopKind": "planned_exit" | "broker_order"   // optional
}
```

The value is optional as a whole. `asOf` (YYYY-MM-DD) is required whenever a value is attached and optional otherwise, so statements like "broke a 4h uptrend" write without friction; the counterpart sets it when a statement is level-bearing. Plan lines use the same value shape plus an optional `asOf`, `elementId`, and `noteId` citation.

`kind` is free text with one reserved value: `entry` (case-insensitive). An agreed `entry` element, or an agreed element whose value is a stop or a per-share dollar level, moves an episode to `Watching`.

Status moves are one-way: `proposed → agreed`, `proposed → dropped`, and `agreed → dropped` (with evidence). Un-agreeing is a supersession or a drop, never a flip back. A counterpart-authored element can only be created `agreed` when the actor is the user relaying agreement.

### Lifecycle inference

`inferEpisodeLifecycle` in `convex/lib/planModel.ts`:

- linked trades exist and net quantity is non-zero: `active`
- linked trades exist and net quantity is zero: `closed`
- otherwise, an endorsed plan version or an agreed level-bearing element (`kind: "entry"`, a stop, or a per-share dollar value): `watching`
- otherwise: `idea`

Fills win. A closed episode never reopens; a later fill opens a new episode. Shelving (`shelvedAt`, with `shelvedBy` and `shelvedSource`) is a disposition, not a lifecycle state, allowed only on open episodes with no fills, and cleared automatically if a fill arrives.

### Trade linking

`syncTradeEpisodeLink` runs after every trade insert or update (manual creation, inbox acceptance, bulk portfolio assignment, seed). A trade with a portfolio attaches to the open episode on its thread that matches the portfolio (an episode with no portfolio yet is adopted) when its execution date is at or after that episode's opened date, or opens a bare episode. Two cases stay unlinked rather than fabricating history: trades without a portfolio, and late fills dated before the open episode began or inside a closed episode's span. The counterpart sorts those in conversation.

`internal.threads.backfillThreadsAndEpisodes` (also exposed as `api.threads.backfillThreadsAndEpisodesForCurrentUser`) creates threads for every traded or note-tagged ticker and one bare episode per flat-to-flat run per portfolio and direction. An open run with no flat point, such as a position held for two years, becomes one active bare episode. It is idempotent. Run it once after deploy.

## Counterpart Tool Contract

All routes live under `/internal/counterpart/` in `convex/http.ts`, use the existing bearer token, and return `{ ok, data }` or `{ ok: false, error: { code, message, retryable } }`. Model errors map to `VALIDATION` (400), `NOT_FOUND` (404), and `CONFLICT` (409).

### Reads

| Route | Body | Returns |
| --- | --- | --- |
| `thread-context` | `{ ticker }` | thread summary with campaign links, `liveEpisodes`, `shelvedEpisodes`, `history` (closed), thread `notes` (bounded, `truncated`), plus `positionFreshness` and `valuation` |
| `episode-context` | `{ episodeId }` | one resolved episode (below) plus `positionFreshness` and `valuation` |
| `desk-context` | `{}` | every live episode grouped by campaign, with checkpoint key lines and agreed or proposed items since the checkpoint; episodes outside any campaign appear in a final "Not in a campaign" group; bare episodes appear with position only and no counts of anything owed |
| `list-campaigns` | `{}` | campaigns with benchmark ticker, linked tickers, and campaign elements |

A resolved episode contains: `episode` (summary with lifecycle, portfolio, campaign, exemptions), `checkpoint` (latest endorsed version or null), `draft` (latest unendorsed version newer than the checkpoint or null), `itemsSinceCheckpoint` (all elements after `compiledThroughRevision`, in revision order, with status and author), `openProposals` (every proposed element, before and after the checkpoint, in revision order, each with `beforeCheckpoint`), `history` (elements at or before the checkpoint, last 50, with `total` and `truncated`), `campaignRules` (`applicable` and `exempted`), `trades`, `position` (derived from linked fills), `notes`, and `planVersions`.

Every bounded list carries an explicit `truncated` flag so an omitted item can never be mistaken for a dropped one.

### Writes

All writes accept an optional `operationId`. A retry with the same id returns the recorded result with `replayed: true`. Reusing an id for a different operation kind is a `CONFLICT`.

| Route | Body | Notes |
| --- | --- | --- |
| `open-episode` | `{ ticker, portfolioId?, campaignId?, actor, source?, operationId? }` | creates the thread if needed |
| `record-elements` | `{ episodeId \| campaignId, elements: [{ statement, status: proposed \| agreed, author, kind?, asOf?, noteId?, supersedes?, value? }], actor, source?, operationId? }` | up to 50 per call; `supersedes` marks the older element `superseded`, and superseding an element that is no longer open is a `CONFLICT` |
| `set-element-status` | `{ elementId, status: agreed \| dropped, evidence?, actor, operationId? }` | only `proposed → agreed`, `proposed → dropped`, `agreed → dropped`; anything else is a `CONFLICT`; `dropped` requires `evidence` |
| `draft-plan-version` | `{ episodeId, sections, compiledThroughRevision?, actor, source?, operationId? }` | `compiledThroughRevision` defaults to the latest revision; moving it backwards is a `CONFLICT` |
| `endorse-plan-version` | `{ episodeId, versionNumber, actor, operationId? }` | only the latest version can be endorsed, and only if no element was agreed after its `compiledThroughRevision`; otherwise `CONFLICT` with `details.staleAgreedElementIds` so the counterpart can redraft |
| `set-episode-campaign` | `{ episodeId, campaignId \| null, exemptedCampaignElementIds?, operationId? }` | links the thread to the campaign as a side effect |
| `shelve-episode` | `{ episodeId, shelved?, actor, source?, operationId? }` | refused on closed episodes and on episodes with fills |
| `upsert-campaign` | `{ campaignId?, name?, thesis?, benchmarkTicker?, linkedTickers?, actor, operationId? }` | light campaigns only; no plan snapshots |

`portfolio-context` and `daily-context` now also return `sync` (`latestAttempt` with a concise `failure` summary, and `latestSuccessfulStatement`), reconciliation issues with `state`, `detectedAt`, `lastRecheckedAt`, and `resolvedAt`, `recentlyResolvedReconciliation`, and `valuation` (below).

### Valuation snapshot

```
valuation: {
  brokerReported: { basis: "broker_reported", asOfDate, cash, marketValue, equity, currency, completeness, missingMarks, pricedPositions, totalPositions, valuationTimestamp } | null,
  reconstructed: { basis: "reconstructed", asOfDate, cash, marketValue, equity, currency: "USD", completeness, missingMarks, portfolios[], staleDates[], valuationTimestamp } | null,
  freshness: { status: current | stale | unavailable, ageDays, latestSuccessfulStatementDate, latestAttemptStatus }
}
```

The two bases are never blended. Positions the broker statement did not price appear in `missingMarks` instead of being valued at zero.

## App Surface

- `/desk`: every live episode, grouped by campaign, one row each with position, checkpoint key lines, and items since. Default landing page for a signed-in user.
- `/threads` and `/threads/<ticker>`: thread index and the thread page with live episodes, checkpoint and draft, items since the checkpoint, open proposals, campaign rules, history, trades, and thread notes. Element and plan edits are made here, attributed to the user; a plan edit creates a new endorsed version.
- Trade Plans left the sidebar. The routes remain reachable by URL.

## Out Of This Change

Plan drafting at the trigger moments, lazy episode drafting in check-ins, and the SMH note split are counterpart prompting work outside this repository. Element kinds, the scenario calculator, retrospectives, lessons, and highlighting remain deferred per the design.
