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
- campaign notes
- related trade plans
- campaign-level retrospective once complete

Role:

- campaigns organize self-developed ideas at the macro or thematic level

Important constraint:

- Not every trade plan must belong to a campaign.

### Trade Plan

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

- trade plans are the main tactical bridge between thesis and execution

Trade plans may be:

- linked to a campaign
- standalone

That flexibility is intentional and reflects real trading workflows.

### Trade

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

- trades are the execution record used for history, review, and analytics

Important constraint:

- Trades do not link directly to campaigns.
- Campaign relationships are derived through trade plans.

## Supporting Object Roles

### Notes

A note belongs to exactly one of:

- a campaign
- a trade plan
- a trade
- no parent at all

Preferred interpretation:

- campaign notes, trade-plan notes, and general notes are the primary note types
- trade-level notes remain secondary to trade-plan-linked commentary

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
- a portfolio's relationship to campaigns is derived through `trades -> tradePlans -> campaigns`

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

Use [glossary.md](glossary.md) for the canonical definitions of these terms.

### Campaign statuses

- `planning`
- `active`
- `closed`

### Trade plan statuses

- `idea`
- `watching`
- `active`
- `closed`

A trade plan could reasonably be:

- `watching` and watched
- `active` and watched
- `idea` and not watched

These concepts should remain separate in the architecture. Navigation and presentation patterns for them belong in [navigation-model.md](navigation-model.md) and [content-and-copy-principles.md](content-and-copy-principles.md).

## Summary

Trade Tracker's information architecture is centered on a flexible strategic hierarchy:

- campaigns organize high-level ideas
- trade plans express tactical setups
- trades record execution

That core structure is supported by evidence objects, workflow staging objects, overlay groupings, and singleton/global documents.

The architecture depends on keeping those distinctions clear while preserving tolerated flexibility around standalone trade plans, unlinked trades, and operational import staging.
