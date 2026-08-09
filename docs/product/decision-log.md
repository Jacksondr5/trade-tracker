# Decision Log

## Purpose

This document records settled product decisions: what was decided, when, and why. Entries are written point-in-time — who raised what, what was discussed, and what was concluded — because the reasoning is the part that is not derivable from the code or the other evergreen docs.

Add an entry when a decision is genuinely settled. Do not record open questions or proposals here.

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

Jackson chose to move IBKR Flex orchestration from the planned self-hosted
Temporal deployment into Convex. The brokerage worker was thin and had never
been deployed: its remaining responsibilities were scheduling, Flex requests,
polling, parsing, and retries, while Convex already owned the sync state,
dedupe, ingestion, and reconciliation model. `@convex-dev/workflow` now provides
the durable delays and retry journal inside the existing backend, so the
pipeline does not require an always-on worker or a separate orchestration
cluster. Flex Web Service remains the brokerage source; only the orchestration
boundary changed.

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
