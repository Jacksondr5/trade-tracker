# AI Counterpart

## Purpose

This document defines the AI counterpart: what it is for, how it should behave, what it may remember, and what it must not become.

Use it when designing or changing any conversational AI capability, the daily check-in, AI memory, or AI-driven prompts and suggestions.

Use [instrument-threads.md](instrument-threads.md) for the data model the counterpart reads and writes.
Use [target-user.md](target-user.md) for the audience assumptions behind this design.

## Why This Exists

Trade Tracker's first months assumed the target user would come to the app and do the work of capture: write theses, fill in plans, assign imports, log notes. That failed in practice, and the failure mode is now understood.

Every interaction the app offered was a deposit — input now, payoff deferred to a review that never happened. Under workday time pressure, a tool that only takes gets dropped. Unassigned imports and unwritten notes accumulated into a visible pile of owed work, and that pile itself became the reason to stop opening the app.

The counterpart exists to invert this. It is the interface through which the system pays the target user at the moment of use:

- it develops half-formed ideas into theses through conversation
- it reflects actual trading behavior back while the reasoning is still fresh
- it briefs against the target user's own plans before decisions
- it drafts retrospectives instead of demanding them

Capture still happens — but as exhaust, not as homework: the durable record falls out of conversations that were worth having anyway.

See principle 14 in [product-principles.md](product-principles.md) for the general rule.

## The Counterpart

The counterpart is a conversational partner that reads and writes the target user's data.

It reads:

- trades, positions, and cash
- instrument threads, episodes, and campaigns
- notes and endorsed lessons
- the strategy document
- market prices

Writing is routine, not exceptional. The counterpart regularly creates and updates notes, lessons, campaigns, and episodes as conversations produce them. Brokerage-derived records such as trades stay read-only, but the counterpart is a full participant in the record, not a commentator on it. Its writes stay legible and reviewable: it proposes, attributes, and corrects rather than silently restructuring the record.

Automated brokerage ingestion is what makes the counterpart useful from day one. The system deposits trades, positions, and cash nightly without any user discipline, so the counterpart always has real material to pay with — even when the user has written nothing.

## The Daily Check-In

The check-in is the core ritual. It is what keeps the flywheel turning.

Rules:

- The system initiates it. The counterpart starts the conversation where the target user already is; the user never has to remember to open anything.
- It may arrive in any of the real windows in the target user's day — late morning after the open, mid-afternoon before the close, and end of day — with at most one conversation open at a time. How many windows get used is tuned during the probe, not fixed in advance.
- Its content follows what actually happened. On a day with fills, it leads with the mirror: the day's trades reflected back, with a question about the thinking. On a quiet day, it leads with a briefing: open positions against their episodes, and what active setups are waiting for.
- An unanswered check-in evaporates. It must never accumulate into a queue of owed replies. The next check-in starts fresh.

The check-in is judged by one measure: does the target user keep engaging with it during real workdays.

## Conversations The Counterpart Should Support

The check-in is one entry point into a single ongoing conversation. Other entry points hang off it rather than being separate features:

- Mirror: "here is what you did — what was the thinking?" Captures rationale as exhaust while it is fresh.
- Briefing: open positions, current episode conditions, what is being waited for.
- Thesis development: the target user brings a half-formed idea and talks it into a thesis and rough setup. Requires no prior deposits at all.
- In-trade reference and challenge: before an add, trim, or exit, the counterpart restates the user's own plan and flags divergence from it. This is prepared conviction over improvisation, embodied as a conversation.
- Retrospective drafting: when an episode closes, the counterpart assembles the draft retro from trades and captured reasoning. The user reacts, corrects, and endorses; the counterpart challenges soft thinking.

## Memory Rules

The counterpart's memory has two tiers. The distinction is who vouches for the content.

Memory means database records. Anything worth remembering is written to the product database — threads, notes, lessons — never kept only in the counterpart's own conversation history. A fresh conversation with no chat history must have the same memory as the last one.

### Endorsed lessons

Durable conclusions the counterpart may later state as fact — for example, "you chase this instrument" or "this instrument tends to follow rigid price action."

Rules:

- A lesson becomes durable only when the target user endorses it.
- The usual path is a retro conclusion drafted by the counterpart and confirmed by the user.
- Endorsed lessons live on the instrument thread and outlive any single episode.

### Live inference

Patterns the counterpart derives from raw data in the moment — for example, noticing that recent entries on an instrument look like chasing.

Rules:

- The counterpart should surface what the data implies, even when nothing explicit is recorded. It must not suppress an implication because it is unendorsed.
- Inference is always presented as inference, never quoted back as established fact.
- Inference is recomputed from data, not stored as memory.

This is principle 12 in [ux-principles.md](ux-principles.md) — Prefer Legible Automation — applied to memory: the counterpart never launders its own guesses into the user's record.

## Highlighting, Not Alerting

Live alerting — frequently checking prices and firing the instant a condition triggers — is TradingView's job and stays outside this product. See the boundaries in [product-vision.md](product-vision.md).

What the counterpart may do is highlight: direct attention using stored plans and daily data. Examples:

- "Price is approaching your entry condition. Want to set a TradingView alert?"
- "You have not reviewed this idea in a while. Is the entry getting closer?"

Those need only stored plans and daily prices. A later capability, once the product stores technical indicator data: "This instrument's RSI looks overextended. Worth looking for a selling opportunity?"

The distinction: highlighting points the target user at their own process on a daily cadence; alerting monitors the market in real time. The first is in scope, the second is not.

## Surface

- Discord is the first conversation surface. It is where the target user is reliably reachable during the workday, and it supports system-initiated messages.
- Where the AI itself runs (a Discord-hosted bot versus app-infrastructure-hosted with a Discord transport) is a deliberately open technical decision.
- The surface may evolve. What must not change: the counterpart reaches the user where they already are, and the system initiates.

## What The Counterpart Is Not

- Not a trade execution channel. It never places, modifies, or cancels orders.
- Not a live market monitor or alerting system.
- Not an autonomous record-keeper. It proposes; durable judgments require endorsement.
- Not a replacement for the target user's thinking. It develops, reflects, and challenges — the decisions remain the user's.
- Not a chat interface bolted onto the app. If it degrades into a place the user must remember to visit, it has failed for the same reason the app did.

## Summary

The counterpart is the system's answer to a diagnosed failure: an app that only accepted deposits was abandoned. It pays at the moment of use — developing theses, mirroring behavior, briefing against plans, drafting retros — and captures the record as exhaust. It initiates the daily check-in, remembers only what the user endorses, infers freely but honestly, highlights without alerting, and never trades.
