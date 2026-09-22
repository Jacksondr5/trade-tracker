# Decision Log

## Purpose

This document records settled product decisions: what was decided, when, and why. Entries are written point-in-time — who raised what, what was discussed, and what was concluded — because the reasoning is the part that is not derivable from the code or the other evergreen docs.

Add an entry when a decision is genuinely settled. Do not record open questions or proposals here.

## 2026-09-22 — Counterpart review: plans are checkpoints, dropping needs evidence

The Discord counterpart reviewed the Phase 3 draft and Jackson answered it
directly; the record is in the QA workspace as
`requirements/phase-3-counterpart-design-review.md`. Settled there and carried
into the design:

- A plan is an agreed checkpoint, not an always-current view. Subsequent
  observations, decisions, and fills stay as items after it in order. A
  reported fill price or a chart observation does not regenerate the plan; a
  new checkpoint is written when the condensed view would itself be meaningful.
- The drafting moment is a clear "this is what we will do next," including a
  deliberate wait or conditional step, not only execution. The counterpart may
  ask one decision-critical question there and may steer back to an instrument
  that needs its checkpoint. No queue, no reminders.
- Endorsing a plan is substantive agreement with its decisions, not
  confirmation of summary accuracy, which holds because illustrative analysis
  never enters the plan.
- `dropped` requires evidence of withdrawal. Nonmention is never evidence.
  This corrects the earlier "silently withdrawn" wording.
- Ordering and linking use revision identifiers, not date arithmetic. Jackson:
  "let's make sure we have a proper linking that doesn't need date
  arithmetic."
- Campaign membership is explicit per episode; thread linkage alone applies
  nothing. Versioned campaign rules stay deferred with campaigns.
- Reported versus verified execution stays a user-attributed element plus the
  imported trade, with no validation machinery. Jackson: "I just don't want to
  get too deep into validating all these things. We aren't building an
  accounting platform."
- Numeric values carry unit, scope, and provenance semantics; a naked number
  is not enough. Reads return resolved context and expose truncation; writes
  are idempotent and revision-aware.
- The risk the counterpart named (a larger event stream to reconstruct from)
  is checked the way this design was made: export the transcript after a few
  weeks of use, verify checkpoints are being written unprompted, and tune.
  Jackson: "do what we did this time around."

## 2026-09-22 — Plans are authored, versioned snapshots; elements are the event stream

Reviewing the rendered model against the real September conversations, Jackson
saw the gap: "we're doing a great job of capturing a lot of different facts,
ideas, and small components of the trade... the biggest problem is that we
aren't converting that into a useful distilled plan." Deriving the current plan
from elements on every read was rejected: "We don't want to derive it all the
time... at some point we need to draw a line, distill all the previous facts
into a solid plan, and then use that as the starting point." His analogy was
compressing a long run of database migrations into a snapshot.

Resolution: elements remain the cheap, uncurated event stream under an
episode. A plan is a separate, versioned child record of the episode, drafted
by the counterpart and endorsed by the user, with a compiled-through timestamp
so later elements are the delta. The desk and thread page render the current
plan plus its delta, never the raw element stream. The counterpart drafts a
version unprompted when the user says they will execute, on the mirror of a
first fill with no plan, and when the delta has visibly drifted the plan. An
unendorsed draft is not owed work. Endorsement is the one deliberate "yes" in
the model, accepted because Jackson had already been asking the counterpart for
this summary by hand.

## 2026-09-22 — Plans are technical; thesis lives on campaigns and thread notes

Jackson: "Thesis might be too broad a word. I think a thesis applies more to a
campaign. We also already have notes on a thread that would really capture a
lot of the thesis data." The plan therefore holds only entry, stop (backstop
versus discretionary), targets, scenarios, structure with as-of dates, and
size. Fundamental and behavioral context about an instrument stays in thread
notes; thematic thesis stays on the campaign.

## 2026-09-22 — Campaigns stay light and get no plan snapshots yet

Asked whether campaigns should get the same snapshot treatment, Jackson
declined: "we haven't really done too much iteration on this directly, and I
also struggled to put meaningful information in those in the original Trade
Tracker." Campaigns keep name, thesis, benchmark link, linked threads, campaign
elements, and notes. Campaign plan snapshots are revisited once a few campaigns
have been worked for real with the counterpart.

## 2026-09-21 — Campaign elements, episode exemptions, and a benchmark link

Replaying the September history showed the semiconductor campaign's rules, not
the instruments' own stops, drove the MU and SNDK exits, and that BE was
explicitly exempted from the SMH gate. Elements therefore attach to campaigns
as well as episodes, and an episode can opt out of specific campaign elements.
Product initially framed SMH as campaign-only; Jackson corrected it: "saying
SMH is just a campaign and not an instrument is not always true. We happen to
be using it as a benchmark here, but it could be traded on its own." The
campaign gets an optional benchmark link to an ordinary instrument thread, and
SMH-tagged probe notes split by content between the campaign and the SMH
thread.

## 2026-09-21 — Four element statuses, including `dropped`; numbers carry as-of dates

The counterpart's history used many hedge states ("leaning", "provisional",
"illustrative", "under evaluation", "would consider"). All mapped onto
proposed, agreed, or superseded except silently withdrawn items with no
replacement (a pattern target both sides stopped citing; a sector cap deferred
and never set), which get `dropped`. Numeric elements require an as-of date
because sloped-line levels and the equity denominator drifted visibly across
the month. Lifecycle transitions are inferred from fills and elements, never
set by the user; a live position with a fully proposed plan is a fact the desk
shows without a warning.

## 2026-09-21 — Test the model against real history, not invented examples

Product had walked an invented NVDA sequence through the model. Jackson: "this
would be a great opportunity to grab some real data from the Discord bot rather
than coming up with ideas on our own." He had the counterpart's full Discord
history exported for the coding agents, and four instruments plus the
cross-cutting workflow were reconstructed from it. Every model change recorded
above came from that replay. The rendered exhibit is kept as a project
artifact, not in the repository, because it carries real prices and positions.

## 2026-09-21 — Phase 2 probe judged successful; Phase 3 planning begins

Jackson reported the check-in ritual has stuck across real workweeks and that
more than 80% of counterpart interactions pay off immediately. The reason he
gave is that planning now happens with the counterpart before execution, so
fill bookkeeping is trivial: "most of the trade bookkeeping work is easy for it
to do because we already talked about the trade that it sees." The remaining
cost is time per trade, with the per-trade workflow still converging. On that
evidence the behavioral hypothesis from 2026-08-04 is treated as confirmed and
Phase 3 design starts. See
[2026-09-21-phase-3-instrument-thread-model-design.md](../plans/2026-09-21-phase-3-instrument-thread-model-design.md).

## 2026-09-21 — The app is the read surface; the conversation is the capture surface

Jackson's most pressing probe problem: "it's becoming really easy to lose track
of the finer details of a particular plan," and he wants to prioritize being
able to use the Trade Tracker interface again. Product's reading, which he
accepted: the app lost as a capture surface, the conversation is winning as
one, so what remains for the app is reading — the current plan per instrument
and every live plan at once. Opening the app should be a withdrawal.

This reverses the roadmap's deferral of UI work, but only for thread and
episode surfaces, which do not exist yet and have a concrete reason to be
opened. Existing campaign and trade-plan surfaces stay untouched. Editing plan
data in the app is allowed; Jackson: "that's a small thing, and it doesn't turn
the app into a capture surface." Edits are attributed and supersede rather than
overwrite so the counterpart sees the change and its history.

## 2026-09-21 — Structure is allowed when the counterpart populates it

Jackson was hesitant about structured data: "I kind of feel like that is what
made things fail the first time." He then corrected himself: the failure was
retroactive bookkeeping and documenting as extra work, whereas now the agent
does the bookkeeping. That became the rule: a field is out if it requires the
user to open a form, and in if the counterpart can populate it from what was
already said. The test of the structure is whether the counterpart has friction
using it, which also makes it cheap to adjust. Counterpart over-asking on fields
is handled by prompting ("use its judgment ... only ask me if it really feels
that it needs an answer"), not by removing structure.

## 2026-09-21 — Episodes are plan-element sets; trade plans are replaced, not migrated

The counterpart's own feedback: successive proposals, corrections, and
decisions on one instrument "shouldn't all look equally final," and answering
"what is the current plan" requires rereading history. Resolution: an episode's
plan is a set of elements, each with a status (proposed, agreed, superseded),
an author (user or counterpart, so unendorsed analysis never reads as the
user's plan), and a link to its source note. The current plan is derived from
agreed, unsuperseded elements. Element kinds are deliberately left open until
the per-trade workflow settles.

Because the old trade plan's fixed text fields do not map onto this and the
clean slate already emptied the layer, trade plans are replaced rather than
migrated. This closes the migrate-or-replace question deferred on 2026-08-04.

## 2026-09-21 — Episode boundary: one position lifecycle in one portfolio

Prompted by the NVDA case (an existing position plus a possible breakout
entry), the boundary was set: an episode runs from first intent or entry to
flat, in one portfolio. Adds, trims, and alternative entry scenarios are
elements inside it. Concurrent episodes on a thread are reserved for genuinely
separate engagements such as the same ticker in two portfolios.

## 2026-09-21 — Migration is lazy and squadron-driven, not batch

Jackson no longer wants to discard prior data, but the data worth migrating is
from when the counterpart started being used. Threads are created
automatically from tickers across all history. Episodes for counterpart-era
instruments are drafted lazily when the instrument next comes up in a check-in,
so no migration backlog exists. For unclear history, Jackson pointed out that
agents in the squadron already talk to the counterpart, so an agent can read or
interview it and write through the counterpart's own write surface: "we
wouldn't have to put a ton of extra logic in the app to guess how the data
should migrate."

## 2026-09-21 — Light campaigns ship in Phase 3

Campaign-shaped thinking is happening in the probe (a semiconductor list worked
as a group) but the counterpart has no campaign object, so it is invisible.
Phase 3 gives the counterpart a deliberately light campaign: name, thesis,
linked threads. Nothing more until a real theme needs it.

## 2026-09-21 — Valuation snapshot and reconciliation state are Phase 3 prerequisites

The counterpart could not obtain a clean, current equity denominator when asked
to size positions, and its planning responses carried resolved reconciliation
issues as if current. Both are Phase 1 deposit-engine debt, but sizing inside
an episode and a clean briefing depend on them, so they are pulled into Phase 3
and sequenced first. The Google Doc the counterpart had been appending
per-instrument summaries to is retired in favor of the app read surface rather
than given a publishing step; Trade Tracker stays authoritative. The chart
tool stays out of Phase 3.

## 2026-08-16 — Trade Tracker is single-user by application policy

Jackson uses one Clerk instance across several apps, so disabling signups in
Clerk would be too broad. An authorization audit confirmed user-facing Convex
functions already scope records through `requireUser`, but another identity
from that shared Clerk instance could still authenticate into an empty Trade
Tracker account. Jackson chose to make the product personal by policy rather
than merely by convention.

The Convex deployment therefore carries an explicit `ALLOWED_USER_IDS`
allowlist of full Clerk token identifiers, enforced at `requireUser`. Missing
or empty configuration denies everyone: a deployment mistake locks the app
instead of reopening it. The route proxy provides an explanatory private
instance page for unlisted signed-in users, but it is deliberately not the
security boundary. Per-owner record scoping remains in place as the second,
independent protection.

`ALLOWED_USER_IDS` is not a global kill switch: worker-secret operations and
the Counterpart HTTP actions use their own fail-closed secrets rather than a
Clerk identity, so removing an allowlisted identity does not revoke those
machine-to-machine paths.

## 2026-08-09 — Partial brokerage reports fail closed and re-syncs must converge

Jackson's first production Flex proof returned only one of two intended IBKR
accounts but was recorded as successful. The empty partial report then created
false missing-position issues, and a corrected re-run left the stale raw report
and contradictory issues attached to the same date. Jackson chose an explicit
expected-account list on each connection as the completeness boundary: if a
report omits any configured account, retain the raw report for diagnosis but do
not ingest or reconcile it. Leaving the list unset keeps the guard opt-in.

Manual force re-sync is the supported recovery path for a terminal or previously
succeeded keyed run; scheduled runs keep their normal dedupe behavior and an
in-flight run is never reclaimed. Because IBKR can cache a statement for a
query and period, an identical forced result is surfaced as a terminal cached-
report outcome rather than clean success. A changed re-sync repoints the run's
raw-report audit reference and recomputes persistent reconciliation issues so
corrected state resolves contradictions without clearing unrelated legitimate
issues.

## 2026-08-06 — Brokerage ingestion uses Convex-native durable workflows

Jackson deliberately retired the planned self-hosted Temporal worker in favor
of Convex-native durable workflows for IBKR Flex orchestration. The Temporal
worker was thin and was never deployed: its responsibilities would have been
scheduling, Flex requests, polling, parsing, and retries, while Convex already
owned the sync state, dedupe, ingestion, and reconciliation model.
`@convex-dev/workflow` now provides the durable delays and retry journal inside
the existing backend, so the current pipeline requires neither an always-on
worker nor a separate orchestration cluster. Flex Web Service remains the
brokerage source; only the orchestration boundary changed.

## 2026-08-04 — Diagnosis: the app failed on deposits versus withdrawals, not capture speed

Jackson opened the AI-capture exploration believing the problem was time: no room in a workday to open the app, screenshot charts, and type. Working through why months of non-use actually happened, a sharper diagnosis emerged and Jackson confirmed it matched his experience: "there's always a mountain of deposit tasks in front of me... Creating that faster payoff that keeps me interacting with the system is a key to success."

Months of non-use were caused by the app being all deposit and no withdrawal: every interaction asked for input (write the thesis, assign imports, log notes) with payoff deferred to reviews and retrospectives that never happened. The accumulated backlog of owed work became itself the reason to stop opening the app. Design center of gravity: every interaction should pay at the moment of use, with capture as a byproduct. Recorded as principle 14 in [product-principles.md](product-principles.md).

## 2026-08-04 — Standing rule: no piles of owed work

Direct consequence of the diagnosis, agreed without reservation: a visible backlog of assignment or annotation homework is the failure state. Either capture happens in the moment or the record stays bare, and bare records are tolerated data, not debt. Unanswered check-ins evaporate.

## 2026-08-04 — Clean slate on campaigns and trade plans

With the diagnosis settled, the existing backlog had to go. Jackson drew the line precisely: trade records are trustworthy and are kept as-is; it is the campaign and trade-plan layer they are assigned to that is untrusted ("its the campaigns and trade plans they're assigned to that might be untrustworthy or worthless"). That layer gets a clean slate, with two exceptions he specified: genuinely well-filled-out items identified by an audit are kept, and anything associated with active or recent trades is backfilled.

One refinement from discussion: backfill for open positions is forward-looking (the plan from here), not reconstructed entry rationale — retrofitting old reasoning would be confabulation, not evidence. Bravos-created trade plans with no user-authored notes are deleted outright; most of their notes are webpage data extracts, not Jackson's thinking.

## 2026-08-04 — Instrument becomes first-class; campaigns stay

Jackson's long-standing frustration: successive plans on the same instrument are hard to track, and trades flow between theses as markets shift. When the capture question ("where does a spoken rationale about a ticker land?") met that frustration, Jackson settled it: "The instrument needs to be a first class citizen, where right now it's just a field on other items."

He immediately bounded the decision: ideas can form without an instrument ("I should investigate industrial opportunities because of X, Y, Z"), which was the original purpose of Campaigns, so this is not a pivot to an instrument-only model. Campaigns are retained as the thematic layer. See [instrument-threads.md](instrument-threads.md).

## 2026-08-04 — Episodes are real objects and carry a source

Two questions settled this shape. First, asked whether genuinely distinct concurrent engagements on one instrument happen in practice, Jackson confirmed they do (for example, across portfolios) — so episodes are real objects under a thread, not a single current-setup slot. Second, Jackson spotted that this gives Bravos data a future home: external trades can attach to threads as sourced episodes, providing context "even if I'm not the one creating the context. Even if I'm not trading on it." That is exactly what the failed in-app Bravos representation got wrong — scraped plans masquerading as his own trade plans. This does not reverse the deactivation decision; it defines the eventual re-entry path if the data is ever wanted.

## 2026-08-04 — Two-tier AI memory: endorsed lessons versus live inference

Asked whether the AI may write behavioral judgments about him ("you chase this instrument") on its own authority, Jackson split it cleanly: "Lessons should only be written down when I've endorsed them, but if an AI draws that conclusion from looking at the data, I'd welcome it. I won't make it ignore what the data implies just because it's not written in the data explicitly."

So: durable lessons the counterpart may quote as fact require endorsement, typically via confirmed retro conclusions. The counterpart may freely infer patterns from raw data and challenge with them, presented as inference — it must not suppress what the data implies, and must not store inferences as fact. See [ai-counterpart.md](ai-counterpart.md).

## 2026-08-04 — Highlighting is in scope; live alerting is not

Jackson drew this distinction himself when the monitoring gap ("I miss entry conditions when I can't watch daily") collided with the product boundary against live alerting. Live alerting — real-time price monitoring with instant triggers — remains TradingView's job. The counterpart may highlight: point attention at the user's own process on a daily cadence, including suggesting TradingView alerts worth setting ("Price is approaching this condition, do you want to set up a TradingView alert?"). This refines the product-vision boundary rather than changing it.

## 2026-08-04 — The check-in is system-initiated; Discord is the first surface

Asked where a daily ritual would actually fit, Jackson named his real windows — late morning after the open, 2–4 PM before the close, and end of day — and added the surface answer unprompted: "it would be great if the AI slid into my DMs to start that conversation." That settled two things: the system starts the conversation (the user never has to remember to open anything), and it arrives where he already is. Discord is the first surface because it is where he is reliably reachable ("I've used it for OpenClaw before").

Cadence within the windows: at most one conversation open at a time; how many windows get used is tuned during the probe rather than fixed in advance. Where the AI runs (Discord-hosted versus app-infrastructure-hosted) is deliberately deferred — "there are genuine pros and cons to both."

## 2026-08-04 — Probe before model migration

Jackson: "putting the theory to the test is the right move. That also lets us start to play with the flywheel before designing out the entire system." The riskiest assumption is behavioral — that a system-initiated check-in gets engaged with repeatedly during real workdays — and it is testable almost for free: a Discord check-in over nightly brokerage data, capturing replies as notes carrying a ticker (an additive field, not a migration to the thread model). The instrument-thread model is built under the ritual only once the ritual has evidence.

## 2026-08-04 — Roadmap resequenced around the flywheel

Consequence of the diagnosis, accepted alongside it: the prior UI-first ordering (navigation overhaul, thinking surfaces, operational polish) no longer leads, because polishing surfaces the user was not opening does not address the failure. The new order: automated deposits and clean slate, flywheel probe, instrument-thread model, counterpart deepening — with the UI phases retained as later work and deep UI investment deferred on surfaces the thread model will reshape. See [roadmap.md](roadmap.md).
