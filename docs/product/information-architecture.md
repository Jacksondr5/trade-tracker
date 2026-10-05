# Information Architecture

## Purpose

This document describes the information architecture of Trade Tracker:

- the major objects in the system
- how they relate to each other
- which relationships are foundational versus derived
- where the product is intentionally flexible
- which parts of the model are provisional or likely to evolve

This document is primarily about object structure and product meaning. It is not a detailed navigation spec.

Use [glossary.md](glossary.md) for the canonical meaning of shared object names, lifecycle states, and focus terms.

## Architectural Summary

Trade Tracker is organized around a permanent per-instrument spine with bounded engagements under it and an optional thematic layer above:

1. `Campaign` (thematic, instrument-optional)
2. `Instrument Thread` (permanent, per ticker)
3. `Episode` (one position lifecycle in one portfolio), holding `Elements` and `Plan Versions`
4. `Trade`

That core chain is supported by additional layers:

- `Notes` for time-stamped reasoning and evidence
- `Strategy` for the formal long-lived operating document
- `Inbox Trades` for pre-acceptance import workflow
- `Portfolios` for capital-allocation grouping
- brokerage sync and reconciliation records for automated ingestion
- market data and portfolio valuation records for portfolio analytics
- `Account Mappings` for display clarity
- derived views such as `Positions`, `Dashboard Stats`, and future analytics

The architecture is intentionally flexible. The product prefers structured workflows, but does not force perfect structure at all times.

## Model Direction

This document describes the model as implemented in Phase 3. See [instrument-threads.md](instrument-threads.md) for the reasoning behind it and the parts later phases still owe (retrospective drafting and endorsed lessons). Trade plans were replaced by episodes; the `tradePlans` table is dormant and its records are legacy data.

## Object Taxonomy

The system is easiest to understand in five groups.

### 1. Core thesis-and-execution objects

- `Campaign`
- `Instrument Thread`
- `Episode`, with its `Elements` and `Plan Versions`
- `Trade`

These represent the main trading workflow from idea to execution.

### 2. Evidence objects

- `Notes`
- chart screenshots attached to notes

These preserve reasoning and review context.

### 3. Workflow objects

- `Inbox Trades`
- `Account Mappings`

These exist to support operational flow rather than long-term meaning (routing/account normalization rather than core thesis structure).

### 4. Overlay objects

- `Portfolios`
- `Watchlist`

These organize or prioritize the core objects without becoming the core hierarchy themselves.

### 5. Singleton and derived views

- `Strategy`
- `Positions`
- `Dashboard Stats`
- analytics surfaces

These provide global guidance or computed interpretation.

## Core Object Roles

### Campaign

Typical contents:

- a thesis
- campaign status
- an optional benchmark link to an ordinary instrument thread
- linked instrument threads
- campaign elements: rules and scenarios that apply across member episodes
- campaign notes
- campaign-level retrospective once complete

Role:

- campaigns organize self-developed ideas at the macro or thematic level

Important constraints:

- Not every episode must belong to a campaign.
- Membership is explicit per episode. Linking a thread to a campaign applies nothing to that thread's episodes.
- Campaigns carry no plan snapshots.

### Instrument Thread

Typical contents:

- the ticker
- running thread notes (ticker-tagged notes belong here)
- links to every episode
- links to campaigns, including any campaign that uses the thread as its benchmark

Role:

- the permanent per-instrument memory; created automatically for every traded or note-tagged ticker

### Episode

Typical contents:

- portfolio, direction, source, and an inferred lifecycle
- elements: the event stream, each with author, status, optional kind and value, and an as-of date on numbers
- plan versions: fixed-section checkpoints with citations, drafted by the counterpart and endorsed by the user
- campaign membership and exemptions from specific campaign elements
- linked trades and episode notes
- a reserved retrospective slot

Role:

- episodes are the tactical bridge between thesis and execution and the unit the desk reads

Rules:

- lifecycle is inferred from elements, checkpoints, and fills; fills win
- an episode with fills and no plan is tolerated data, not a warning
- elements after a checkpoint are its delta; they never regenerate it
- `dropped` requires evidence; nonmention is never evidence

### Trade

Typical contents:

- ticker
- side
- direction
- price
- quantity
- brokerage account
- optional portfolio
- optional episode, maintained automatically from ticker, portfolio, and direction

Role:

- trades are the execution record used for history, review, and analytics
- trades drive episode lifecycle
- supporting reasoning should remain attached to threads, episodes, or campaigns rather than directly to trades

Important constraint:

- Trades do not link directly to campaigns.
- Campaign relationships are derived through episodes.
- A trade without a portfolio stays unlinked rather than being guessed into an episode.

## Supporting Object Roles

### Notes

A note belongs to exactly one of:

- a campaign
- an instrument thread (a ticker-tagged note is a thread note)
- an episode
- no parent at all

Preferred interpretation:

- all notes live in one unified notes table
- note types are distinguished by parent IDs (campaignId, threadId, episodeId; none means general notes)
- notes do not attach directly to trades
- the legacy tradePlanId attachment remains only on old records

### Strategy

Architecture:

- one strategy document per user

Role:

- defines the durable framework the rest of the trading process should follow

### Inbox Trades

Role:

- they are a staging area between external brokerage data and accepted trade history

Lifecycle:

1. import from brokerage CSV
2. validate
3. optionally auto-match or manually map
4. accept into `Trade`

This is an operational workflow object, not a long-term strategic object.

### Portfolios

Current primary attachment point:

- trades
- inbox trades during review

Role:

- Portfolios help organize capital and exposure
- they are important for grouping, review, and analytics
- they are not the primary thesis hierarchy

Important nuance:

- the same campaign may be expressed across multiple portfolios
- the same or similar trade plans may exist within the same campaign but across different portfolios
- the same external or internal idea may be represented differently depending on the capital bucket

So portfolios are meaningful, but their relationship to campaigns and trade plans is best understood as derived through trades, not as the core parent-child structure.

### Account Mappings

Role:

- they improve readability across trades and imports

### Brokerage Sync Runs And Snapshots

Role:

- they record automated brokerage ingestion attempts and source snapshots
- they support reconciliation between brokerage state and accepted trades
- they help determine whether portfolio valuation inputs are fresh enough to
  trust

Important constraint:

- brokerage sync records are operational evidence, not the canonical trade
  history
- accepted trades and portfolio cash ledger entries remain the source of
  portfolio valuation math

### Market Data Instruments

Role:

- they map app trade tickers to provider-specific symbols for market price lookup
- they are an internal resolution cache, not a primary user-facing object

Important constraint:

- trades remain the execution record and keep their own ticker and asset type
- market data instruments support valuation and should not become the way trades are identified
- unresolved market data mappings should be handled during trade creation or import review

### Market Price Snapshots

Role:

- they cache daily close prices from the configured market data provider
- they support portfolio valuation without calling external providers from portfolio pages

Important constraint:

- the first version should store close prices only
- live prices, adjusted price series, currencies, splits, and dividends are later concerns

### Portfolio Cash Ledger Entries

Role:

- they record external cash movement into or out of a portfolio
- they are canonical input for cash balance and return calculations

Important constraint:

- trade cash flows come from trades
- deposits, withdrawals, and corrections come from the cash ledger

### Portfolio Daily Valuations

Role:

- they store the derived daily portfolio equity series used for graphs and review

Important constraint:

- they are materialized analytics, not source-of-truth records
- they should remain recomputable from trades, cash ledger entries, and market price snapshots

## Relationship Model

### Foundational relationships

The foundational chain is:

- `Instrument Thread -> Episode -> Trade`, with `Campaign` linking across threads and episodes

More precisely:

- a thread has many episodes, and several may be live at once (one per portfolio)
- an episode has many elements, many plan versions, and many trades
- a trade may optionally belong to an episode
- an episode may optionally belong to a campaign, and a campaign may link many threads and one benchmark thread
- campaign elements apply to member episodes minus each episode's exemptions

### Evidence relationships

- a campaign, a thread, or an episode can have many notes
- an element may cite the note it came from; a plan line may cite an element or a note
- screenshots belong to notes, not directly to campaigns, episodes, or trades

### Overlay relationships

- a portfolio can have many trades
- a portfolio can have many inbox trades
- a portfolio's relationship to campaigns is derived through `trades -> episodes -> campaigns`
- portfolio cash ledger entries belong to portfolios
- portfolio daily valuations belong to portfolios
- market price snapshots belong to market data instruments

## Ideal Workflow Versus Tolerated Workflow

Trade Tracker intentionally distinguishes between the ideal workflow and tolerated flexibility.

### Ideal workflow

1. Plan in conversation with the counterpart; elements and checkpoints fall out as exhaust
2. Fills arrive by import and attach to the episode
3. Read the current plan on the desk or the thread page
4. Review outcomes later through retrospectives and analytics

### Tolerated workflow

- theme-first (campaign, then threads) and instrument-first (thread or episode, later a campaign or never) are co-equal
- episodes may exist without a campaign, a checkpoint, or any agreed element
- trades may exist without an episode
- imports may temporarily hold incomplete associations

Bare records are tolerated data, never a lesser state or a pile of owed work.

## Status Model

Use [glossary.md](glossary.md) for the canonical definitions of these terms.

### Campaign statuses

- `planning`
- `active`
- `closed`

### Episode lifecycle

- `idea`
- `watching`
- `active`
- `closed`

Lifecycle is inferred, never set. `shelved` is a separate disposition for unfilled ideas.

An episode could reasonably be:

- `watching` and watched
- `active` and watched
- `idea` and not watched

These concepts should remain separate in the architecture. Navigation and presentation patterns for them belong in [navigation-model.md](navigation-model.md) and [content-and-copy-principles.md](content-and-copy-principles.md).

## Summary

Trade Tracker's information architecture is centered on a permanent per-instrument spine:

- instrument threads hold an instrument's memory
- episodes express one engagement, as an event stream of elements distilled into endorsed checkpoints
- campaigns organize high-level ideas across threads and episodes
- trades record execution and drive lifecycle

That core structure is supported by evidence objects, workflow staging objects, overlay groupings, and singleton/global documents.

The architecture depends on keeping those distinctions clear while preserving tolerated flexibility around bare episodes, unlinked trades, and operational import staging.
