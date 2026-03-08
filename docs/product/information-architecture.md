# Information Architecture

## Purpose

This document describes the current information architecture of Trade Tracker:

- the major objects in the system
- how they relate to each other
- which relationships are foundational versus derived
- where the current product is intentionally flexible
- which parts of the model are provisional or likely to evolve

This document is primarily about object structure and product meaning. It is not a detailed navigation spec.

## Architectural Summary

Trade Tracker is organized around a core chain of strategic thinking, tactical planning, and execution:

1. `Campaign`
2. `Trade Plan`
3. `Trade`

That core chain is supported by additional layers:

- `Notes` for time-stamped reasoning and evidence
- `Strategy` for the formal long-lived operating document
- `Inbox Trades` for pre-acceptance import workflow
- `Portfolios` for capital-allocation grouping
- `Account Mappings` for display clarity
- derived views such as `Positions`, `Dashboard Stats`, and future analytics

The architecture is intentionally flexible. The product prefers structured workflows, but does not force perfect structure at all times.

## Object Taxonomy

The system is easiest to understand in five groups.

### 1. Core thesis-and-execution objects

- `Campaign`
- `Trade Plan`
- `Trade`

These represent the main trading workflow from idea to execution.

### 2. Evidence objects

- `Notes`
- chart screenshots attached to notes

These preserve reasoning and review context.

### 3. Workflow objects

- `Inbox Trades`

These exist to support operational flow rather than long-term meaning.

### 4. Overlay objects

- `Portfolios`
- future `Watchlist` focus flag

These organize or prioritize the core objects without becoming the core hierarchy themselves.

### 5. Singleton and derived views

- `Strategy`
- `Positions`
- `Dashboard Stats`
- future analytics surfaces

These provide global guidance or computed interpretation.

## Core Object Definitions

### Campaign

Meaning:

- A campaign is a strategic container for a higher-level market idea.

Typical contents:

- a thesis
- campaign status
- campaign notes
- related trade plans
- campaign-level retrospective once complete

Role:

- Campaigns are where self-developed ideas are organized at the macro or thematic level.

Important constraint:

- Not every trade plan must belong to a campaign.

### Trade Plan

Meaning:

- A trade plan is a tactical setup for a specific instrument or expression of an idea.

Typical contents:

- instrument symbol
- rationale
- entry conditions
- target conditions
- exit conditions
- instrument notes
- status
- linked notes
- linked trades

Role:

- Trade plans are the main tactical bridge between thesis and execution.

Trade plans may be:

- linked to a campaign
- standalone

That flexibility is intentional and reflects real trading workflows.

### Trade

Meaning:

- A trade is a recorded execution event.

Typical contents:

- ticker
- side
- direction
- price
- quantity
- brokerage account
- optional portfolio
- optional trade plan
- optional notes field

Role:

- Trades are the execution record used for history, review, and analytics.

Important constraint:

- Trades do not currently link directly to campaigns.
- Campaign relationships are derived through trade plans.

## Supporting Object Definitions

### Notes

Meaning:

- Notes are time-stamped reasoning records with optional chart screenshots.

A note can currently belong to exactly one of:

- a campaign
- a trade plan
- a trade
- no parent at all

Current product reality:

- Campaign notes and trade-plan notes are active workflows
- general notes are active workflows
- trade-level notes are technically supported by the data model but are not a primary product workflow today

Current product preference:

- if a trade is important enough to warrant ongoing commentary, that usually suggests it should have a trade plan

### Strategy

Meaning:

- Strategy is the formal, long-lived operating document for the user.

Architecture:

- one strategy document per user

Role:

- Defines the durable framework the rest of the trading process should follow.

### Inbox Trades

Meaning:

- Inbox trades are imported executions awaiting review and acceptance.

Role:

- They are a staging area between external brokerage data and accepted trade history.

Lifecycle:

1. import from brokerage CSV
2. validate
3. optionally auto-match or manually map
4. accept into `Trade`

This is an operational workflow object, not a long-term strategic object.

### Portfolios

Meaning:

- Portfolios are capital-allocation buckets used to group trades.

Current primary attachment point:

- trades
- inbox trades during review

Role:

- Portfolios help organize capital and exposure
- they are important for grouping, review, and future analytics
- they are not the primary thesis hierarchy

Important nuance:

- the same campaign may be expressed across multiple portfolios
- the same or similar trade plans may exist within the same campaign but across different portfolios
- the same external or internal idea may be represented differently depending on the capital bucket

So portfolios are meaningful, but their relationship to campaigns and trade plans is currently best understood as derived through trades, not as the core parent-child structure.

### Account Mappings

Meaning:

- Account mappings translate raw brokerage account identifiers into user-friendly names.

Role:

- They improve readability across trades and imports.

## Relationship Model

### Foundational relationships

The foundational chain is:

- `Campaign -> Trade Plan -> Trade`

More precisely:

- a campaign can have many trade plans
- a trade plan can have many trades
- a trade may optionally belong to a trade plan
- a trade plan may optionally belong to a campaign

### Evidence relationships

- a campaign can have many notes
- a trade plan can have many notes
- a trade can have many notes in the model
- screenshots belong to notes, not directly to campaigns, trade plans, or trades

### Overlay relationships

- a portfolio can have many trades
- a portfolio can have many inbox trades
- a portfolio's relationship to campaigns is currently derived through `trades -> tradePlans -> campaigns`

## Ideal Workflow Versus Tolerated Workflow

Trade Tracker intentionally distinguishes between the ideal workflow and tolerated flexibility.

### Ideal workflow

1. Develop a campaign
2. Add one or more trade plans
3. Execute trades against those trade plans
4. Take notes during the campaign and trade-plan lifecycle
5. Review outcomes later through retrospectives and analytics

### Tolerated workflow

- standalone trade plans may exist without a campaign
- trades may exist without a trade plan
- imports may temporarily hold incomplete associations

This tolerance exists mainly to reduce administrative burden and avoid blocking data capture.

The product should support that flexibility without treating it as the preferred steady state.

## Status Model

### Campaign statuses

- `planning`
- `active`
- `closed`

Campaign status reflects lifecycle stage.

### Trade plan statuses

- `idea`
- `watching`
- `active`
- `closed`

Trade-plan status also reflects lifecycle stage.

Important nuance:

- `watching` is not the same as a future `Watchlist` flag
- `watching` means the trade plan is developed enough to monitor, but is waiting for price action or conditions to trigger execution
- `Watchlist` should instead mean "important until explicitly unwatched"

So:

- `watching` is a tactical readiness state
- `Watchlist` is a cross-cutting attention signal

A trade plan could reasonably be:

- `watching` and watched
- `active` and watched
- `idea` and not watched

These concepts should remain separate in the architecture even if current UX still blends some of them.

## Navigation Implications

The object model is hierarchical enough that navigation should reflect that hierarchy clearly.

High-level implications:

- campaigns and trade plans should be navigable as a tree, not just as isolated pages
- standalone trade plans should be surfaced as first-class items, not hidden edge cases
- notes and strategy should be treated as distinct surfaces, not forced into the same interaction model
- portfolios should be discoverable as overlays on execution and analytics, not mistaken for strategic parents

Detailed interaction patterns for this belong in the navigation model documentation.

## Current Architectural Tensions

### 1. Trade-level notes exist in the model but not in the primary workflow

This is currently acceptable, but should remain explicit.

Interpretation:

- the model is more permissive than the current product behavior
- this may remain fine, or it may eventually be tightened


### 2. Portfolios matter increasingly for exposure and analytics

Today portfolios are mainly trade-level grouping constructs.

That is coherent, but future analytics may require a clearer architectural stance on whether portfolios should remain:

- purely trade-linked

or evolve toward stronger associations with:

- trade plans
- campaign summaries

## Summary

Trade Tracker's information architecture is centered on a flexible strategic hierarchy:

- campaigns organize high-level ideas
- trade plans express tactical setups
- trades record execution

That core structure is supported by evidence objects, workflow staging objects, overlay groupings, and singleton/global documents.

The architecture is already sound in its fundamentals. The main work ahead is to:

- document the distinctions more clearly
- surface the hierarchy better in navigation
- preserve flexibility without losing clarity about the ideal workflow
