# Glossary

## Purpose

This document defines the canonical meaning of shared product terms in Trade Tracker.

Use it when a document, screen, or agent needs to know what a term means before deciding how to describe, structure, or present it.

## Core Objects

### Campaign

A strategic container for a higher-level market idea.

Campaigns organize thesis, status, campaign-level notes, and related trade plans.

Lifecycle states:

- `Planning`: the campaign idea is still being formed or structured.
- `Active`: the campaign is live, in force, or presently relevant within the trading process.
- `Closed`: the campaign has completed its active lifecycle.

### Trade Plan

Retired. The trade plan's role is carried by `Episode` under an `Instrument Thread` (see below and [instrument-threads.md](instrument-threads.md)). The `tradePlans` table and its routes remain dormant and reachable by URL only; nothing new is written to them.

Lifecycle states:

- `Idea`: the setup exists conceptually but is not yet ready for close monitoring or execution.
- `Watching`: the setup is developed enough to monitor, but is waiting for price action or conditions to trigger execution.
- `Active`: the trade plan is live, in force, or presently relevant within the trading process.
- `Closed`: the trade plan has completed its active lifecycle.

### Trade

A recorded execution event.

Trades preserve the execution record and link to an episode when their portfolio is known. A trade with no episode is tolerated data.

### Note

A time-stamped reasoning record with optional chart screenshots.

Notes may belong to a campaign, an instrument thread, an episode, or no parent object. A ticker-tagged note belongs to that ticker's thread.

### Strategy

The formal, long-lived operating document for the target user's trading practice.

### Inbox Trade

An imported execution awaiting review and acceptance into the permanent trade record.

Status terms:

- `Pending Review`: the imported or provisional record still requires review before acceptance.

### Portfolio

A capital-allocation bucket used to group trades and exposure.

Portfolios are overlays on the core hierarchy, not the main thesis structure.

### Account Mapping

A translation from a raw brokerage account identifier to a user-friendly account name.

## Instrument Thread Model Objects

These objects are the implemented planning model described in [instrument-threads.md](instrument-threads.md).

### Instrument Thread

A permanent per-instrument container and the instrument's memory.

For one ticker, a thread aggregates:

- running notes about the instrument over time
- the accumulated read on how the instrument behaves
- endorsed lessons, including lessons about the user's own behavior with the instrument
- links to every episode, the user's own and external
- links to campaigns the instrument participates in

Threads never close. They exist so context survives between engagements with an instrument instead of being buried when a plan closes.

### Episode

A bounded engagement with an instrument, created under an instrument thread.

An episode holds setup conditions (entry, target, stop, required macro conditions), linked trades, notes captured while it is live, and a retrospective when it closes. A thread may have several live episodes at once — for example, a short-term swing and a longer-term hold in different portfolios.

Episodes carry a source. Most are authored by the user; trades from an external service may attach to a thread as episodes for context without being part of the user's own planning.

Lifecycle states are inferred, never set by hand: `Idea` on the first element, `Watching` on the first agreed entry condition or endorsed checkpoint, `Active` on the first linked fill, `Closed` when the position is flat. `Shelved` is a separate disposition the user can give an unfilled idea so it leaves the desk. When an episode closes, its retrospective conclusions become candidate lessons on the thread.

An episode with fills and no plan is a fact the desk shows, not a warning.

### Element

One statement in an episode's or a campaign's event stream: a proposal, decision, observation, rule, or fact. Every element records who authored it (the user or the counterpart), a status (`proposed`, `agreed`, `superseded`, or `dropped`), an as-of date whenever it carries a number, and optionally a kind, a typed value, and the note it came from.

`dropped` requires evidence of withdrawal. Nonmention is never evidence.

### Checkpoint

The display label for an endorsed plan version: the distilled, authored snapshot of an episode's technical plan at a decision moment. It has six fixed sections (entry, stop, targets, scenarios, structure, size), each a short list of lines with citations. A plan version is drafted by the counterpart and endorsed by the user; a user edit in the app creates a new endorsed version. Elements recorded after a checkpoint are its delta and do not regenerate it.

### Desk

The app view of every live episode at once: instrument, portfolio, lifecycle, position, the latest checkpoint's key lines, and the agreed and proposed items since it, grouped by campaign.

### Endorsed Lesson

A durable conclusion on an instrument thread that the user has explicitly confirmed, typically from a retrospective. Examples: "this instrument tends to follow rigid price action", "I chase this one."

Only endorsed lessons may be stated back as fact by the AI counterpart. Unendorsed patterns are live inference, presented as inference and never stored as fact.

## AI Terms

### AI Counterpart

The conversational AI partner. It reads the user's data (trades, positions, threads, episodes, campaigns, notes, lessons, strategy, prices), writes routinely through legible and reviewable paths (notes, drafted retrospectives, proposed lessons, campaigns, episodes), and initiates the check-in. See [ai-counterpart.md](ai-counterpart.md).

### Check-In

The system-initiated conversation from the AI counterpart, arriving in the user's real workday windows with at most one open at a time. Its content follows the day: a mirror of new fills, or a briefing on open positions and waiting setups. An unanswered check-in evaporates rather than becoming owed work.

## Engagement Terms

These terms come from principle 14 in [product-principles.md](product-principles.md).

### Deposit

An interaction that asks the user for input — writing a thesis, assigning an import, logging a note — with the payoff deferred to later review.

### Withdrawal

An interaction that gives the user value at the moment of use — a briefing, a developed thesis, a drafted retrospective, a surfaced lesson.

### Flywheel

The intended engagement loop: automated ingestion deposits data without user discipline, the check-in pays value out of that data and captures reasoning as a byproduct, retrospectives feed lessons forward, and each turn makes the next interaction pay more.

## Relationship Terms

### Campaign Membership

An episode belongs to a campaign only when that membership is recorded explicitly. Linking a thread to a campaign applies nothing to the thread's episodes by itself. A member episode inherits the campaign's elements and may exempt itself from specific ones.

### Benchmark

An ordinary instrument thread that a campaign points at for its rules and scenarios, such as SMH for a semiconductor campaign. It is never a special ticker.

## Focus Terms

### Watchlist

A cross-cutting attention layer for objects that deserve repeated visibility until explicitly removed.

`Watchlist` is separate from lifecycle state.

### Watched

An object that has been added to `Watchlist`.

`Watched` does not imply any particular lifecycle state.

## Distinction Rules

- Keep lifecycle and focus separate.
- Do not use `watching` to mean `on Watchlist`.
- Do not use `priority`, `pinned`, `starred`, and `watched` interchangeably unless the product explicitly adopts one of those terms later.
- Do not treat portfolios as the parent structure for campaigns or episodes.
- Do not treat bare records (a trade without an episode, a thread without a campaign, an episode without a checkpoint) as debt or unfinished homework.
- Do not present counts of episodes that "need" a plan or any other owed-work queue.
- Do not present AI inference as endorsed fact, and do not suppress inference because it is unendorsed.

## Naming Rule

Use the glossary term itself in product copy unless a document explicitly defines a different display label for that context.
