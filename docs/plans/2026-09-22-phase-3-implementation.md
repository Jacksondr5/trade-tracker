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

Every write records who authored the statement (`author`: user or counterpart), who performed the write (`actor`: user, counterpart, agent, system), and which channel produced it (`source`: conversation, app, migration, trade_history). Endorsement is recorded only on plan versions and is always `endorsedBy: "user"`; `endorsementActor` records who relayed it (the user in the app, the counterpart in conversation). Only those two actors may endorse; a migration agent's writes carry `actor: "agent"` and are refused as endorsements.

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

Fills win. Closed is terminal: a later fill opens a new episode, and an edit to a fill inside a closed episode is accepted only while the episode stays flat (a price or date correction); an edit that would reopen it or move the fill to another portfolio is refused with a `CONFLICT` so the correction is recorded deliberately as a new fill instead. Shelving (`shelvedAt`, with `shelvedBy` and `shelvedSource`) is a disposition, not a lifecycle state, allowed only on open episodes with no fills, and cleared automatically if a fill arrives.

### Trade linking

`syncTradeEpisodeLink` runs after every trade insert or update (manual creation, inbox acceptance, bulk portfolio assignment, seed). A trade with a portfolio attaches to the open episode on its thread that matches the portfolio (an episode with no portfolio yet is adopted) when its execution date is at or after that episode's opened date, or opens a bare episode. Two cases stay unlinked rather than fabricating history: trades without a portfolio, and late fills dated before the open episode began or inside a closed episode's span. The counterpart sorts those in conversation.

`internal.threads.backfillThreadsAndEpisodes` (also exposed as `api.threads.backfillThreadsAndEpisodesForCurrentUser`) creates threads for every traded or note-tagged ticker and one bare episode per flat-to-flat run per portfolio and direction. An open run with no flat point, such as a position held for two years, becomes one active bare episode. It is idempotent, and it skips any ticker, portfolio, and direction group that already has linked fills, so a fill deliberately left unlinked by live linking is never turned into a phantom episode on a rerun.

Deployment order matters because of that skip: run the backfill immediately after deploying and before the next brokerage sync or inbox acceptance. Once a group has a live-linked fill, older unlinked history in that group is left as it is; it can still be linked deliberately through the counterpart, but the backfill will not guess at it.

Every trade write also ensures the ticker's thread exists, whether or not the fill can be placed in an episode, and the counterpart's ticker-tagged note capture does the same.

## Counterpart Tool Contract

All routes live under `/internal/counterpart/` in `convex/http.ts`, use the existing bearer token, and return `{ ok, data }` or `{ ok: false, error: { code, message, retryable } }`. Model errors map to `VALIDATION` (400), `NOT_FOUND` (404), and `CONFLICT` (409).

### Reads

| Route | Body | Returns |
| --- | --- | --- |
| `thread-context` | `{ ticker }` | thread summary with campaign links, `liveEpisodes`, `shelvedEpisodes`, `history` (closed), thread `notes` (bounded, `truncated`), plus `positionFreshness` and `valuation` |
| `episode-context` | `{ episodeId }` | one resolved episode (below) plus `positionFreshness` and `valuation` |
| `desk-context` | `{}` | every live episode grouped by campaign, with checkpoint key lines and agreed or proposed items since the checkpoint; episodes outside any campaign appear in a final "Not in a campaign" group; bare episodes appear with position only and no counts of anything owed |
| `list-campaigns` | `{}` | campaigns with benchmark ticker, linked tickers, and campaign elements |

A resolved episode contains: `episode` (summary with lifecycle, portfolio, campaign, exemptions), `checkpoint` (latest endorsed version or null), `draft` (latest unendorsed version newer than the checkpoint or null), `itemsSinceCheckpoint` (every element created or changed after `compiledThroughRevision`, ordered by the revision of its last change, so agreeing or dropping an older proposal shows as a delta item), `openProposals` (every proposed element, before and after the checkpoint, each with `beforeCheckpoint`), `history` (elements created at or before the checkpoint, last 50, with `total` and `truncated`), `campaignRules` (`applicable` and `exempted`), `trades`, `position` (derived from linked fills), `notes`, `planVersions` (newest 200, with `planVersionsTruncated`), and `latestRevision` (the highest revision touching the episode, for edit conflict checks).

Every bounded list carries an explicit `truncated` flag so an omitted item can never be mistaken for a dropped one: `elementsTruncated`, `campaignRules.truncated`, `planVersionsTruncated`, `history.truncated`, `notes.truncated` on an episode, `episodesTruncated` on a thread, and `truncated` on the desk. The same numbers are enforced as write ceilings (2,000 elements per episode, 500 per campaign, 500 episodes per thread), so a read never has to throw on a record it cannot bound; a write past a ceiling is refused with `VALIDATION`. The checkpoint is loaded directly from the episode's current-version pointer, so a long run of drafts can never push it out of the bounded version listing. Two continuation reads exist for what the bounded episode read leaves out:

| Route | Body | Returns |
| --- | --- | --- |
| `episode-elements` | `{ episodeId, cursor?, numItems? }` | one page of the episode's elements, oldest first, with `nextCursor` and `hasMore` |
| `plan-version` | `{ episodeId, versionNumber }` | one historical version with its sections |

### Writes

All writes accept an optional `operationId`. A retry with the same id returns the recorded result with `replayed: true`. Reusing an id for a different operation kind is a `CONFLICT`.

| Route | Body | Notes |
| --- | --- | --- |
| `open-episode` | `{ ticker, portfolioId?, campaignId?, actor, source?, operationId? }` | creates the thread if needed |
| `record-elements` | `{ episodeId \| campaignId, elements: [{ statement, status: proposed \| agreed, author, kind?, asOf?, noteId?, supersedes?, value? }], actor, source?, operationId? }` | up to 50 per call; `supersedes` marks the older element `superseded`, and superseding an element that is no longer open is a `CONFLICT` |
| `set-element-status` | `{ elementId, status: agreed \| dropped, evidence?, actor, operationId? }` | only `proposed → agreed`, `proposed → dropped`, `agreed → dropped`; anything else is a `CONFLICT`; `dropped` requires `evidence` |
| `draft-plan-version` | `{ episodeId, sections, observedRevision, compiledThroughRevision?, actor, source?, operationId? }` | `observedRevision` is required: the `latestRevision` from the read the draft was composed from. Any element changed or plan version written after it is a `CONFLICT` with `details.staleAgreedElementIds`; nothing unseen is ever absorbed. `compiledThroughRevision` defaults to `observedRevision`; moving it backwards from the previous version is a `CONFLICT` |
| `endorse-plan-version` | `{ episodeId, versionNumber, agreeElementIds?, actor, operationId? }` | actor must be `user` or `counterpart`; only the latest version can be endorsed. `agreeElementIds` marks those proposals agreed as part of the same endorsement and absorbs them into the checkpoint. Refused with `CONFLICT` and `details.staleAgreedElementIds` if, after the draft's cutoff, any element was agreed or any element the draft cites was dropped or superseded |
| `link-trade` | `{ tradeId, episodeId \| null, operationId? }` | places a fill deliberately after a conversation has sorted it out (a late or ambiguous fill), or unlinks it. Same ticker, portfolio, and direction required. A closed episode accepts or releases a fill only if it stays flat; otherwise `CONFLICT` |
| `set-episode-campaign` | `{ episodeId, campaignId \| null, exemptedCampaignElementIds?, operationId? }` | links the thread to the campaign as a side effect |
| `shelve-episode` | `{ episodeId, shelved?, actor, source?, operationId? }` | refused on closed episodes and on episodes with fills |
| `upsert-campaign` | `{ campaignId?, name?, thesis?, benchmarkTicker?, linkedTickers?, actor, operationId? }` | light campaigns only; no plan snapshots |

`add-note` also accepts an optional `episodeId` or `campaignId`, so rationale can attach to an episode (including after it closes) or a campaign instead of only the ticker's thread.

### Operation ids and retries

Every write accepts an optional `operationId`. The same id with the same body replays the recorded result with `replayed: true` and writes nothing. The same id with a different body, or used for a different write, is a `CONFLICT`. Each write is one transaction: it either fully applies or leaves nothing behind, so a multi-call sequence that stops partway can be resumed by retrying the remaining calls with their original ids. Every write response returns the records it produced (ids, statuses, revisions), which serve as the receipt.

### Sequences

**Drafting a checkpoint.** Read `episode-context`, compose the draft from what the read returned, then call `draft-plan-version` with `observedRevision` set to that read's `latestRevision`. On `CONFLICT`, read again and recompose; the conflict lists the element ids that changed.

**Endorsing.** When Jackson agrees to the draft as a whole, call `endorse-plan-version` with `agreeElementIds` set to the draft's cited proposals he agreed to. When he agrees with exceptions, leave the exceptions out of `agreeElementIds`; if an exception is part of the plan's text, draft a new version without it first rather than endorsing a plan that contains it. One reply from Jackson is always one endorse call.

**A withdrawal after drafting.** If Jackson withdraws something the draft cites, record the drop (with evidence) or the superseding element; the draft becomes stale and endorsing it is refused. Redraft from a fresh read.

**Corrections and late fills.** Linking follows fills automatically. Closed history is never reopened: a fill correction that would reopen a closed episode or move a fill out of it is refused, and a late fill dated inside a closed span or before the open episode began is left unlinked. Neither is a reason to record a new execution. Discuss it, then place the fill with `link-trade` (which accepts it into a closed episode only when that episode stays flat), or leave it unlinked, which is tolerated data. Rationale about a closed engagement goes on the episode with `add-note { episodeId }` or as an element on that episode.

### Status history

Each element carries `statusHistory`: every status it has held, with actor, revision, time, and drop evidence, so a later supersede or drop never hides when it was agreed. Elements written before this existed show their current status as a single entry.

### Where the rest of a truncated list lives

| Flag | Where the remainder is |
| --- | --- |
| episode `history.truncated` | `episode-elements` pages every element of the episode, oldest first |
| episode `planVersionsTruncated` | `plan-version` returns any version by number; the current checkpoint and newest draft are always returned directly |
| episode `notes.truncated`, thread `notes.truncated` | `list-notes { ticker }` pages every note on the ticker with a cursor, including episode notes |
| episode `elementsTruncated`, `campaignRules.truncated`, thread `episodesTruncated` | Structurally never true: writes are refused past the same ceilings (2,000 elements per episode, 500 per campaign, 500 episodes per thread), so the bounded read always holds the whole set |
| desk `truncated` | Only above 300 live episodes; each omitted episode is still reachable through `thread-context { ticker }` |

`portfolio-context` and `daily-context` now also return `sync` (`latestAttempt` with a concise `failure` summary, and `latestSuccessfulStatement`), reconciliation issues with `state`, `detectedAt`, `lastRecheckedAt`, and `resolvedAt`, `recentlyResolvedReconciliation`, and `valuation` (below).

### Valuation snapshot

```
valuation: {
  brokerReported: { basis: "broker_reported", asOfDate, cash, marketValue, equity, currency, completeness, missingMarks, pricedPositions, totalPositions, valuationTimestamp } | null,
  reconstructed: { basis: "reconstructed", asOfDate, cash, marketValue, equity, currency: "USD", completeness, missingMarks, portfolios[], staleDates[], valuationTimestamp } | null,
  freshness: { status: current | stale | unavailable, ageDays, latestSuccessfulStatementDate, latestAttemptStatus }
}
```

The two bases are never blended. Positions the broker statement did not price appear in `missingMarks` instead of being valued at zero. Amounts are summed only when every one of them is known to share the account's single cash currency: when the statement holds several currencies, or a mark carries no currency or a different one, that mark is left out and listed in `unsupportedCurrencyMarks`. A statement with no base cash row reports `missingCash: true`; portfolios with no valuation row are listed in `missingPortfolios`. Any of these makes `completeness` partial. The broker `currency` is the account's single cash currency, or null when the denomination is unknown.

## App Surface

- `/desk`: every live episode, grouped by campaign, one row each with position, checkpoint key lines, and items since. Default landing page for a signed-in user.
- `/threads` and `/threads/<ticker>`: thread index and the thread page with live episodes, checkpoint and draft, items since the checkpoint, open proposals, campaign rules, history, trades, and thread notes. Element and plan edits are made here, attributed to the user; a plan edit creates a new endorsed version.
- Trade Plans left the sidebar. The routes remain reachable by URL.
- Thread and episode note queries return `{ items, truncated }` envelopes; the thread page shows a line when older notes are not shown.
- App edits (elements, statuses, plan saves, endorsements) are refused on closed episodes. A plan save sends the version it was opened from and the latest revision it saw; a save over decisions recorded in the meantime is a `CONFLICT` rather than a silent overwrite.

## Follow-ups

- Shared notes component: existing notes should render before the composer, with the composer collapsed behind a button, consistent with the add-element treatment on the thread page. Out of scope here because the component is shared by campaigns and trade plans.
- `tests/e2e/smoke/trade-plans.spec.ts` "accepts seeded inbox trades locally" fails on `main` as well: the trade plan detail page never rendered accepted trade rows. Retire or rewrite it with the trade plan routes.

## Out Of This Change

Plan drafting at the trigger moments, lazy episode drafting in check-ins, and the SMH note split are counterpart prompting work outside this repository. Element kinds, the scenario calculator, retrospectives, lessons, and highlighting remain deferred per the design.
