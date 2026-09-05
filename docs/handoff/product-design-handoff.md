# Product & Design Handoff

This document transfers the product-design context of the "From Manual Entry to Automated & Conversational Trading Process" epic to agents with no access to the original conversations. It pairs with `coordination-handoff.md` (delivery state, operational history, agent process); this half covers why the product is shaped the way it is, which decisions are settled and why, and where the Phase 3 design stands.

Read `docs/product/README.md` and the docs it indexes first; this document assumes them and does not restate them. Epic artifacts referenced by name (e.g. `flywheel-probe-tech-plan`) live under the epic's artifact tree and carry detail this document deliberately does not copy.

## 1. The Product Thesis

The single most important piece of context: **this product failed once, and the diagnosis of that failure governs everything built since.**

Trade Tracker's first months assumed the target user would come to the app and do the work of capture — write theses, fill in trade plans, assign imports, log notes. Months of near-total non-use followed. The initial explanation was capture friction (no time during a workday to open the app and type). The diagnosis that replaced it, confirmed explicitly by the user, is recorded as principle 14 in `docs/product/product-principles.md` and in `docs/product/decision-log.md`:

**The app was all deposit and no withdrawal.** Every interaction asked for input with the payoff deferred to a review that never happened. The accumulated backlog of owed work (unassigned imports, unwritten notes) became itself the reason to stop opening the app. Under workday time pressure, a tool that only takes gets dropped.

Two corollaries carry most of the design weight:

- **Pay at the moment of use.** Every interaction must give value now; capture happens as a byproduct of conversations worth having anyway ("exhaust"), never as homework. A visible pile of owed assignment/annotation work is *the failure state* — either capture happens in the moment or the record stays bare, and bare records are tolerated data, not debt.
- **The system initiates** (principle 13 in `docs/product/ux-principles.md`). The steps of the trading process that die under time pressure are the self-driven ones. A product that waits to be opened joins them. Hence the check-in arrives in Discord during real workday windows; an unanswered check-in evaporates — no reminders, no guilt surface.

A validating datum from production: after automated IBKR ingestion shipped and worked flawlessly, unreviewed trades still accumulated in the inbox. **Automating the deposit relocated the pile; it did not clear it.** Only the conversational accept loop (the counterpart proposing, the user confirming in Discord) drained it. That is the thesis working as predicted, in both directions.

The counterpart (see `docs/product/ai-counterpart.md`) is the interface built on this diagnosis: it develops half-formed ideas, mirrors actual trading behavior back while reasoning is fresh, briefs against the user's own plans, and drafts retrospectives — and the durable record falls out of those exchanges.

## 2. The Decision Set (with reasoning)

These are settled. Conclusions live in `docs/product/decision-log.md` and the epic decision log; the reasoning that produced them is the part conversations held and this section preserves.

**Plan-layer condemnation and amnesty.** The campaign/trade-plan layer built in the app's first months was judged untrusted — plans went stale, trades flowed between theses, successive plans on one instrument started blank. Trade records themselves were always trustworthy; it was the planning objects assigned to them that were worthless. Decision: clean slate. Differentiation between condemned and new data is **by deletion, not marking or date cutoffs** — after cleanup the tables are uniformly trustworthy by construction, no trust-flag pollutes future queries. Safety: archive before delete; nothing unrecoverable. Executed 2026-08-23 (see `coordination-handoff.md`); the plan-layer tables are now empty, retrospectives were converted to notes with `origin: "retrospective"`, and removing the dead feature code is the agreed opening move of Phase 3. A subtlety worth keeping: backfill for open positions was defined as **forward-looking only** ("what's the plan from here") — reconstructing months-old entry rationale would be confabulation, not evidence, violating the preserve-evidence principle.

**Instrument becomes first-class; campaigns stay.** The instrument is the one thing always known at the moment of capture (a fill or a quick thought always has a ticker; picking the right plan among stale plans is a disambiguation chore). So the instrument thread — a permanent per-ticker container — becomes the spine. But this is explicitly *not* an instrument-only model: ideas also form with no instrument at all ("investigate industrials because of X"), which is what campaigns were always for. Two co-equal entry directions: theme-first (campaign resolves downward into instruments) and instrument-first (thread may later link upward into a campaign, or never). See `docs/product/instrument-threads.md`.

**Episode as a real object, carrying a source.** A bounded engagement with an instrument: setup conditions, lifecycle (`Idea → Watching → Active → Closed`), notes, linked trades, a retrospective on close. Real object because genuinely distinct concurrent engagements on one instrument happen in practice (e.g. a short-term swing and a longer-term hold in different portfolios) — so "the thread's one current setup" is not enough. Episodes carry a source/author because external context should be attachable without masquerading as the user's own planning: the failed Bravos import failed *precisely because* scraped plans posed as the user's plans; as Bravos-sourced episodes on a thread they become ambient evidence at zero deposit cost. That is the agreed re-entry path if that data is ever wanted again.

**The thread carries cross-trade memory, including behavioral self-knowledge.** What must survive between engagements: what happened in previous episodes, relevant campaign context, and lessons about the user's own behavior with the instrument ("I chase this one", "this instrument follows rigid price action"). Today's model loses all of this when a plan closes; the thread exists so closing an episode enriches rather than buries its context.

**Two-tier memory: endorsed lessons vs live inference.** Durable conclusions the counterpart may state back as fact require the user's explicit endorsement (typically confirmed retro conclusions). But the counterpart must be free to infer patterns from raw data and challenge with them, presented *as* inference — it must not suppress what the data implies just because it is unrecorded, and must not launder its guesses into the record as fact. This is the legible-automation principle applied to memory, and it is the trust boundary that makes counterpart write access acceptable.

**The retro loop closes through thread memory.** Retrospectives were the deadest part of the old workflow because nothing ever consumed them — writing one was the purest deposit-with-no-withdrawal. In this design the retro finally has a paying customer: its endorsed conclusions become the warnings and context served at the *next* entry decision on that instrument. The withdrawal for doing a retro is a smarter counterpart next time. When evaluating any retro feature, ask "what consumes this?" first.

**Highlighting, not alerting.** Live alerting (real-time price monitoring, instant triggers) is TradingView's job and stays out. Daily-cadence pointing at the user's own process — "price is approaching your entry condition, want to set a TradingView alert?" — is in scope. Boundary refinement recorded in `docs/product/product-vision.md`.

**Personal product by policy.** Single user, enforced by a fail-closed identity allowlist at the `requireUser` choke point — not merely intended. Other identities from the shared auth instance can authenticate but reach no data. Consequence for design: no multi-tenant obligations shape any decision; the recorded bias if that ever changes is bring-your-own-host for the counterpart (operated hosting is a business decision, not a feature decision).

**Probe before model migration.** The riskiest assumption in the whole epic is behavioral — that a system-initiated check-in gets engaged with repeatedly during real workdays — so it is being tested (cheaply, with additive schema only) before the instrument-thread migration is built. Phase 3 *design* proceeds now; Phase 3 *build* is gated on probe evidence.

## 3. The Probe's Product Intent

Terms, mechanics, and the 2026-08-27 re-baseline live in the epic artifact `flywheel-probe-tech-plan` (see its "Re-Baseline" section) and the contract in `counterpart-read-surface/hermes-http-contract`. What matters product-wise:

- **What it tests:** the flywheel hypothesis — automated ingestion deposits data, the system-initiated check-in pays value out and captures reasoning as exhaust, and this keeps a real user engaged through real workdays *after novelty fades*.
- **Why the bar is what it is:** answered check-ins on ≥3 answered workdays/week with nonzero notes, judged on weeks 3–4 only (2026-09-14 → 2026-09-25), from the `checkIns` table alone. The bar was set *before* building precisely so it cannot be softened after weeks of sunk effort. If it is missed, the honest reading is "the hypothesis failed cheaply" — which is the probe succeeding at its job. Do not let anyone (including the user) quietly soften it; that discipline was an explicit commitment.
- **The qualitative signal:** does the mirror ("you closed your bank-ETF position Monday — what was that about?") feel like being *handed* something, or like being *assigned* something? If check-ins read as homework, that is a design failure regardless of the metrics.
- **The freeze rule:** ritual changes reset the probe clock; bug fixes don't. Design work during the window must not touch the check-in ritual.

## 4. Phase 3 Design State at Handoff

**Be clear-eyed about this: the Phase 3 design conversation had not yet started with the user.** A framing message was delivered (settled ground, the durability question, one pressure-test) but received no response before handoff. Nothing below is decided beyond the 2026-08-04 decisions in section 2.

**Settled by production, not by design conversation:** the episode *boundary* semantics run live. `derivePositionEpisodeState` (`convex/lib/openPositions.ts`) computes flat-to-flat groups from accepted trades, keyed by `ticker:direction`; `inferPortfolioFromOpenEpisode` (`convex/imports.ts`) uses them in the accept loop to inherit portfolios, deliberately persisting **no episode ID** — that decision was reserved for Phase 3. Fills inside an open group inherit silently; openers always ask; implausible history refuses to guess.

**The open hard questions**, in dependency order:

1. **Episode↔trade linkage: derived vs stored.** The outgoing agent's on-record recommendation (proposed, *not* adopted): durable `episodes` rows with `episodeId` stamped on trades at accept time — following the exact precedent `portfolioId` already set (computation decides, storage remembers, conflicts surface as questions). Pure derivation fails three ways that all reduce to "no stable identity": a plan exists before any trade (nothing to derive from), notes/retros/lessons need a stable attachment target, and external-source episodes have no trades in the book at all.
2. **Boundary behavior when trades are edited/deleted/backdated.** Recommended posture: surface reconciliation issues rather than auto-repair, consistent with the accept endpoint's `outOfOrder`/`CONFLICT` handling.
3. **Is a "plan" an episode in `Idea`/`Watching` state, or a separate object?** The recommendation leans unified lifecycle (opener fill flips `Idea/Watching → Active`; flat closes it and offers the retro; an unplanned opener auto-creates a bare `Active` episode as tolerated data) — but this was not yet discussed.
4. **Fill routing under concurrency — the sharpest known wrinkle.** The user's articulated mental model bounded groups per ticker+*account*; the shipped derivation keys by ticker+*direction* with no account dimension, and concurrent same-ticker episodes in different portfolios (which the user says genuinely happen) currently surface as `open_episode_portfolio_conflict` and punt to a human question. Stored episodes dissolve the derivation limit (membership is assigned, not computed), but the routing question becomes load-bearing: when two episodes could claim a fill, is "ask one targeted question" the permanent answer, or does account or the plan's stated conditions disambiguate? Also unresolved: whether account matters to episode identity at all.
5. **Queued behind those:** whether the thread is a table or just the ticker as a key (endorsed lessons need a durable home; the notes UI's ticker/origin badges are an explicit stopgap awaiting a thread view); and the counterpart's plan-write contract (the Hermes contract's scope note promises typed planning reads/writes when Phase 3 lands — the user's most-wanted capability is plans-from-conversation).
6. **Constraint to honor:** chart attachments on notes are deferred and out of MVP scope, but the thread design must not preclude them.

## 5. Product-Doc Map and Known Drift

Authoritative, current:

- `docs/product/product-principles.md`, `ux-principles.md`, `product-vision.md`, `target-user.md` — the principle layer; principle 14 (pay at the moment of use) and 13 (system initiates) are the epic's contributions.
- `docs/product/ai-counterpart.md` — counterpart behavior rules, memory tiers, highlighting boundary.
- `docs/product/instrument-threads.md` — the *target* model direction; explicitly not implemented.
- `docs/product/decision-log.md` — dated decisions with reasoning; the epic's decision log carries later entries not yet mirrored here.
- `docs/product/glossary.md` — including target-model terms (Instrument Thread, Episode, Endorsed Lesson) and engagement terms (Deposit, Withdrawal, Flywheel).

Known drift to correct as Phase 3 proceeds:

- **The plan layer exists in docs and code but has zero rows.** `information-architecture.md`, `feature-philosophy.md`, `navigation-model.md`, and the glossary's current-model sections still describe campaigns/trade plans as the live core hierarchy; since 2026-08-23 those tables are empty, nothing writes to them, and `tradePlanId` is gone from the trade contract. The docs' "IA remains authoritative for the implemented model until migration" posture predates the clean slate and now overstates reality.
- **`roadmap.md` phase framing lags:** Phase 1 is complete; Phase 2 (the probe) is running with outcomes pending; some Phase 2/3 items shipped early through the accept loop (e.g. the pile-drain moved from check-in conversation to the `accept-trade` write path).
- **The counterpart's real interface is documented in the epic artifact** (`counterpart-read-surface/hermes-http-contract`), not in `docs/product/`. Endpoint names for orientation: `daily-context`, `instrument-context`, `list-notes`, `list-fills`, `strategy-context`, `portfolio-context`, `accept-trade`, plus the check-in lifecycle endpoints, all under `/internal/counterpart/` in `convex/http.ts`.

## 6. What I Would Do Next

1. **Nothing that touches the ritual until the probe window closes** (2026-09-25). Design conversations are fine; ritual changes reset the clock.
2. **Resume the Phase 3 conversation at the durability question** (section 4, items 1–4) — with the user, one thread at a time, pressure-testing rather than presenting. The routing-under-concurrency wrinkle (item 4) is where his mental model and the shipped code genuinely diverge, and resolving it will decide most of the schema. Do not skip to schema-writing; every prior settled decision in this epic came from the conversation surfacing something the initial framing had wrong.
3. **Hold the probe evaluation honestly** when the window closes: the bar as stated, from `checkIns` data, plus the withdrawal-vs-homework question asked directly. Pass → Phase 3 build with evidence; fail → regroup on ritual design before any migration. Either way, the *evaluation itself* should be measured against production data, not memory or impressions — that discipline (claims settled by measurement) served this epic repeatedly.
4. **Fold the drift corrections of section 5 into Phase 3's opening move** (the dead-code deletion PR is the natural vehicle for the doc updates).
5. **Design the plan-write contract last**, after episode identity settles — it is the user's most-wanted capability, which is exactly why it should not be shaped before the object it writes to is.

One closing orientation note: the user's stated wants are reliable but his first framings are starting points — the epic's biggest wins (deposit/withdrawal reframe, backlog-as-fuel, deletion-over-marking) each came from pushing back on an initial framing and having the push-back land. Engage as a thinking partner, not a requirements-taker.
