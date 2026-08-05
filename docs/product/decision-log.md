# Decision Log

## Purpose

This document records settled product decisions: what was decided, when, and why. It preserves reasoning that is not derivable from the code or the other evergreen docs.

Add an entry when a decision is genuinely settled. Do not record open questions or proposals here.

## 2026-08-04 — Diagnosis: the app failed on deposits versus withdrawals, not capture speed

Months of non-use were caused by the app being all deposit and no withdrawal: every interaction asked for input (write the thesis, assign imports, log notes) with payoff deferred to reviews that never happened. The accumulated backlog of owed work became itself the reason to stop opening the app. This supersedes the earlier framing that capture friction was the primary problem. Design center of gravity: every interaction should pay at the moment of use, with capture as a byproduct. Recorded as principle 14 in [product-principles.md](product-principles.md).

## 2026-08-04 — Standing rule: no piles of owed work

A visible backlog of assignment or annotation homework is the failure state. Either capture happens in the moment or the record stays bare, and bare records are tolerated data, not debt. Unanswered check-ins evaporate.

## 2026-08-04 — Clean slate on campaigns and trade plans

Trade records are trustworthy and are kept as-is. The existing campaign and trade-plan layer is untrusted and gets a clean slate, with two exceptions: genuinely well-filled-out items identified by an audit are kept, and anything associated with active or recent trades is backfilled. Backfill for open positions is forward-looking (the plan from here), not reconstructed entry rationale — retrofitting old reasoning would be confabulation, not evidence. Bravos-created trade plans with no user-authored notes are deleted outright.

## 2026-08-04 — Instrument becomes first-class; campaigns stay

The instrument moves from a field on trade plans to a first-class object (the instrument thread). This is not a pivot to an instrument-only model: campaigns are retained for ideas that form without an instrument, which was their original purpose. See [instrument-threads.md](instrument-threads.md).

## 2026-08-04 — Episodes are real objects and carry a source

Concurrent distinct engagements on one instrument happen in practice (for example, across portfolios), so episodes are real objects under a thread, not a single current-setup slot. Episodes carry a source: external trades (for example, Bravos) can attach to threads as context without masquerading as the user's own planning — which is exactly how the earlier in-app Bravos representation failed.

## 2026-08-04 — Two-tier AI memory: endorsed lessons versus live inference

Durable lessons the counterpart may quote as fact require the user's endorsement, typically via confirmed retro conclusions. The counterpart may freely infer patterns from raw data and challenge the user with them, presented as inference — it must not suppress what the data implies, and must not store inferences as fact. See [ai-counterpart.md](ai-counterpart.md).

## 2026-08-04 — Highlighting is in scope; live alerting is not

Live alerting (real-time price monitoring with instant triggers) remains TradingView's job. The counterpart may highlight: point attention at the user's own process on a daily cadence, including suggesting TradingView alerts worth setting. This refines the product-vision boundary rather than changing it.

## 2026-08-04 — The daily check-in is system-initiated; Discord is the first surface

The system starts the conversation, arriving where the user already is during real workday windows (late morning, mid-afternoon, end of day). Discord is the first surface because it is where the user is reliably reachable. Where the AI runs (Discord-hosted versus app-infrastructure-hosted) is deliberately deferred.

## 2026-08-04 — Probe before model migration

The riskiest assumption is behavioral: that a system-initiated check-in gets engaged with repeatedly during real workdays. It is tested first with a minimal probe (Discord check-in over nightly brokerage data, capturing replies as instrument-tagged notes) before any schema migration. The instrument-thread model is built under the ritual only once the ritual has evidence.
