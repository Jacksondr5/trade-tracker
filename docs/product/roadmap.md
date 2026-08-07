# Product Roadmap

## Purpose

This roadmap describes the current intended sequence of major product work for Trade Tracker.

It is not a release plan. It is a strategic ordering based on the diagnosis recorded in [decision-log.md](decision-log.md): the app failed through months of non-use because every interaction was a deposit with a deferred payoff. The sequence below is ordered around restarting and proving the engagement flywheel before investing in surfaces or migrations.

This supersedes the earlier UI-first ordering (navigation overhaul, thinking surfaces, operational polish). That work remains valid and is retained below in compressed form, but it no longer leads: polishing surfaces the target user was not opening does not address the failure.

## Roadmap Principles

- Restore automated deposits and remove the owed-work pile before anything else.
- Test the riskiest assumption — that a system-initiated check-in gets engaged with during real workdays — before building on it.
- Migrate the data model on evidence from real use, not ahead of it.
- Keep every interaction paying at the moment of use (principle 14 in [product-principles.md](product-principles.md)).
- Defer deep UI investment in surfaces the instrument-thread model will reshape.
- Roll the new visual design system out incrementally as major surfaces are touched.
- Build missing shared UI primitives as soon as a phase needs them rather than deferring them to a later cleanup pass.
- Every phase should leave touched surfaces more compliant with the shared UI and shared form system than before.
- Keep the roadmap flexible where the product is still exploratory.

## Phase 1: Automated Deposits And Clean Slate

Goal: the system deposits data without user discipline, and the pile of owed work is gone.

Includes:

1. Finish and prove IBKR automated ingestion: connection/status UI, reconciliation visibility, and the nightly sync proven against the real account (see [brokerage-ingestion.md](brokerage-ingestion.md))
2. Deactivate the Bravos import feature and clear its review backlog; delete Bravos-created trade plans with no user-authored notes
3. Clean slate on the campaign and trade-plan layer: audit for genuinely well-filled-out keepers, then clear the rest
4. Forward-looking backfill for active and recent positions: establish the plan from here, not reconstructed entry rationale

Why this phase comes first:

- automated ingestion is the deposit engine everything downstream pays from
- the owed-work pile is the standing reason the app stopped being opened

## Phase 2: Flywheel Probe

Goal: test whether the system-initiated daily check-in actually gets engaged with during real workdays, before any model migration.

Includes:

1. A minimal AI counterpart reachable over Discord DM (see [ai-counterpart.md](ai-counterpart.md))
2. System-initiated check-ins in the real workday windows (late morning, mid-afternoon, end of day), at most one conversation open at a time, with cadence tuned during the probe
3. The mirror and the briefing as check-in content, fed by nightly IBKR data
4. Replies captured as notes carrying a ticker — an additive field, not a migration to the thread model
5. Unanswered check-ins evaporate; nothing accumulates

Success measure:

- the ritual sticks across real workweeks, judged by sustained engagement, not feature completeness

Why this phase comes second:

- the entire design rests on one behavioral hypothesis, and it is testable almost for free
- if the ritual does not stick, that is learned cheaply with no migration to unwind

## Phase 3: Instrument Thread Model

Goal: build the target data model under a ritual that has evidence.

Includes:

1. Instrument threads as permanent first-class objects
2. Episodes: bounded engagements with setup conditions, lifecycle, source, and concurrency support
3. Trade plan migration or replacement, informed by probe experience
4. Note attachment to threads and episodes
5. Campaign linkage to threads and episodes (see [instrument-threads.md](instrument-threads.md))
6. Update the evergreen docs to reflect the migrated model: retire the target-model markers in the glossary, README, and feature philosophy, and make [information-architecture.md](information-architecture.md) describe the new model as implemented

Why this phase follows the probe:

- migration is expensive and its shape should be informed by how capture actually behaves in practice

## Phase 4: Counterpart Deepening

Goal: close the retro loop and grow the counterpart's value per exchange.

Includes:

1. Retrospective drafting when episodes close; endorsed lessons written to threads
2. Lessons and past-episode context surfaced at re-entry decisions
3. Highlighting: approaching conditions, stale ideas, suggested TradingView alerts
4. Thesis-development conversations feeding campaigns and threads
5. External-source episodes (for example, Bravos re-entry as thread context) if wanted

Why this phase sits here:

- each item deepens a loop the earlier phases have already made real

## Later: App Surface Improvement

The earlier roadmap's UI phases live here in compressed form. They remain worth doing, but deep investment waits until the instrument-thread model has settled, because campaign and trade-plan surfaces are exactly what the model reshapes.

- Navigation and working context: sidebar shell, local hierarchy rail, command palette, watchlist as a focus layer (see [navigation-model.md](navigation-model.md))
- Core thinking surfaces: strategy editor, notes workflow, detail-page information design, retrospective UI
- Operational efficiency: import review throughput, status and copy standardization, loading states
- Systemization: shared UI primitives, page templates, visual design system rollout (see [visual-design-system.md](visual-design-system.md))
- Trade-detail visibility: make a deliberate decision about a trade-detail workflow while keeping notes centered on threads, episodes, and campaigns

## Later: Analytics And Review Maturity

- Baseline performance and exposure analytics across portfolios, campaigns, and threads
- Review-oriented analytics that point to what deserves diagnosis
- Retrospective summaries, and possibly retrospectives of retrospectives, once single-episode retros are routine
- Watchlist and review signals surfaced into the dashboard
- Dashboard redesign once the analytical model is mature enough to justify it
- Portfolio model clarification if analytics prove a stronger structural role is needed

Analytics still come after the flywheel work: they are a withdrawal surface, and they need the deposit engine and captured reasoning to have something to reveal.

## Notes On Scope

- `Watchlist` remains separate from lifecycle status throughout.
- Portfolios remain overlays unless analytics prove otherwise.
- Bare records stay tolerated data in every phase; no phase may reintroduce an owed-work pile.
- The Discord-vs-app-infrastructure hosting decision for the counterpart is made during the probe, not before.
- Shared UI and shared form migration is not isolated to a cleanup phase; each phase should improve the system on the surfaces it touches.
- `Dashboard` remains strategically important but is not an early design priority.
- Maintain `technical-architecture-overview.md`, `glossary.md`, the [decision log](decision-log.md), and this roadmap as the product changes.

## Summary

The roadmap is ordered around one lesson: the product failed by waiting quietly and demanding deposits.

1. restore automated deposits and clear the owed work
2. prove the system-initiated ritual cheaply
3. build the instrument-thread model on that evidence
4. deepen the counterpart until the retro loop compounds
5. then invest in surfaces and analytics

Each phase exists to make the next one's payoff real.
