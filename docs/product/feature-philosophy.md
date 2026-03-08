# Feature Philosophy

## Purpose

This document explains what each major product area in Trade Tracker is for.

It is meant to answer:

- what job each feature serves
- what kind of work it should support
- what it should optimize for
- what it should explicitly not try to become

This helps keep feature work aligned with the product vision instead of drifting into adjacent ideas just because they are possible.

## Overall Product Framing

Trade Tracker is a personal trading process system.

Its major feature areas should work together to support:

- thesis development
- tactical planning
- execution context
- evidence capture
- honest review
- performance improvement over time

Not every feature should try to do all of those jobs. Each feature should have a clear role in that larger loop.

## Feature Areas

### Campaigns

Primary job:

- organize high-level market ideas into strategic containers

What campaigns should optimize for:

- thesis clarity
- grouping related tactical expressions
- preserving strategic notes over time
- making the state of an idea legible

What campaigns are for:

- defining why an idea matters
- tracking whether a broad thesis is still valid
- grouping related trade plans into a coherent strategic idea
- eventually supporting campaign-level retrospective review

What campaigns are not for:

- direct trade execution
- being required for every trade plan
- replacing the detailed tactical logic of trade plans

Design implication:

- campaigns should feel strategic, not operational
- they need stronger narrative density than a plain status table

### Trade Plans

Primary job:

- turn ideas into executable tactical setups

What trade plans should optimize for:

- clarity of setup
- entry/exit logic
- tactical reference during live trades
- preserving the reasoning behind execution

What trade plans are for:

- expressing a concrete instrument-level opportunity
- linking thesis to execution
- holding the plan that live trade decisions should refer back to
- supporting both campaign-linked and standalone workflows

Design implication:

- trade plans should be one of the main working surfaces in the app
- navigation between trade plans should be cheap and obvious

### Trades

Primary job:

- preserve the execution record

What trades should optimize for:

- accuracy
- scanability
- linkage to context
- future analytical usefulness

What trades are for:

- recording what was actually executed
- anchoring review in objective evidence
- connecting performance outcomes to plans and notes

What trades are not for:

- being the main place where thesis is developed
- replacing trade plans as the place for ongoing tactical reasoning

Design implication:

- trades should remain legible and link outward to context
- they are evidence first, not the main strategic workspace

### Notes

Primary job:

- capture time-stamped reasoning and observations quickly

What notes should optimize for:

- fast entry
- chronological readability
- evidence capture
- easy rereading during and after trades

What notes are for:

- preserving in-the-moment thoughts
- attaching screenshots and commentary to the relevant context
- making later retrospectives more honest and detailed

What notes are not for:

- replacing the formal strategy document
- becoming a generic long-form knowledge base

Design implication:

- notes should feel like a lightweight field journal
- they should privilege capture and rereading over polished document structure

### Strategy

Primary job:

- serve as the formal operating document for the user's trading practice

What strategy should optimize for:

- clarity
- durability
- structure
- easy review and revision over time

What strategy is for:

- documenting the rules, allocations, and frameworks that should govern trading behavior
- making the broader process explicit
- serving as the durable reference point behind campaigns and trade plans

What strategy is not for:

- quick note capture
- operational workflow management
- per-trade commentary

Design implication:

- strategy should feel like a formal document workspace
- it should be optimized for structured writing, not fast fragment capture

### Imports

Primary job:

- convert external brokerage data into clean internal trade records with minimal friction

What imports should optimize for:

- weekly throughput
- low administrative burden
- trustworthy matching and correction

What imports are for:

- reviewing imported trades
- auto-matching or manually assigning context
- quickly creating missing trade plans when needed
- accepting trades into the permanent record

What imports are not for:

- deep analysis
- extended browsing
- polished but slow editorial interactions

Design implication:

- imports should be judged by how quickly and reliably a weekly batch can be processed
- this is an operational admin workflow, not a prestige surface

### Dashboard

Primary job:

- eventually provide orientation and summary

Current reality:

- the dashboard is intentionally underdeveloped because the analytics layer is not yet mature

What dashboard should optimize for later:

- showing where attention is needed
- summarizing performance and activity
- surfacing important watched or active work

What dashboard is not for right now:

- driving current design priorities
- pretending the analytics layer already exists

Design implication:

- the dashboard should remain strategically important, but not dominate current product design work

### Positions

Primary job:

- show current open exposure derived from trade history

What positions should optimize for:

- quick exposure read
- clarity
- analytical usefulness later

What positions are for:

- answering what is currently open
- showing how much exposure exists by ticker and direction

What positions are not for:

- replacing campaign or trade-plan thinking
- serving as the main portfolio management surface

### Portfolios

Primary job:

- group trades into capital-allocation buckets

What portfolios should optimize for:

- exposure grouping
- capital organization
- future analytics relevance

What portfolios are for:

- separating different buckets of money
- helping interpret performance and exposure by allocation bucket
- supporting cross-cutting review of trades that share a capital source

What portfolios are not for:

- becoming the main thesis hierarchy
- replacing campaigns or trade plans as the primary planning structure

Design implication:

- portfolios matter, but they should remain an overlay unless future analytics clearly require stronger structural promotion

### Accounts

Primary job:

- improve readability of brokerage account data

What accounts should optimize for:

- clarity
- low maintenance
- better labeling of imported and historical data

What accounts are for:

- mapping raw account identifiers to names the user understands

What accounts are not for:

- becoming a large settings surface by themselves

### Navigation / Watchlist

Primary job:

- reduce the cost of revisiting important and hierarchical objects

What navigation should optimize for:

- cheap movement
- preserved hierarchy awareness
- return to important items

What watchlist should optimize for:

- explicit focus
- persistent visibility
- separation of attention from lifecycle status

What this area is not for:

- adding complexity without real movement savings
- conflating tactical readiness with general importance

## Anti-Drift Rules

When considering new work, ask:

- does this help develop better thesis, planning, review, or analytics?
- does this remove real friction from an existing workflow?
- does this preserve or improve evidence quality?
- does this help the user become more independent and process-driven over time?

If the answer is no, the feature is likely drift.

In particular, features should face a high bar if they start drifting toward:

- broker-like execution
- live monitoring
- alerting systems
- charting replacement
- social or mass-market trading features

## Summary

Each feature in Trade Tracker should have a clear role inside the larger trading-process loop.

The product works best when:

- campaigns hold strategic ideas
- trade plans hold tactical setups
- trades preserve execution evidence
- notes preserve reasoning
- strategy preserves the operating framework
- imports reduce admin burden
- portfolios organize capital
- navigation keeps important context and priorities easy to reach

Feature work should deepen those roles, not blur them.
