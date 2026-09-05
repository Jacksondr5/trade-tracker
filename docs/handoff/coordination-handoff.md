# Coordination Handoff — Trade Tracker Epic

**Written 2026-08-28 by the outgoing coordinating agent. Companion: [`product-design-handoff.md`](product-design-handoff.md) (product thesis, design decisions, Phase 3 state).**

This is the operational half: what shipped, what is true in production right now, what is queued, and the working rules that were paid for in incidents. Written for an agent with no access to the originating conversations. Epic artifacts live at `~/.traycer/epics/02b031fe-551f-4522-9f84-c0c992c1442f/artifacts/` and are referenced by name; they hold detail deliberately not duplicated here.

Anything below stated as fact about production was measured against the deployment, not inferred from code or docs. **Re-measure before relying on it** — see [Verification discipline](#verification-discipline).

---

## 1. What this epic set out to do

Four themes, from the owner's opening framing. The app "captures the data needed but still relies on manual data entry and reconciliation," and trading happens during a workday when he cannot key things in, producing "large gaps and a very big backlog that I struggle to work down."

| #   | Theme                                            | State at handoff                                                                    |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | Revisit IBKR connectivity                        | **Done** — nightly Flex ingestion running unattended, order-level, timezone-correct |
| 2   | Migrate from manual entry to AI chat interaction | **Live** — Discord counterpart on Hermes, reading and writing                       |
| 3   | Disable Bravos import, clear the backlog         | **Done** — feature deactivated, data cleaned                                        |
| 4   | Make instrument central to the data model        | **Not started** — this is Phase 3, gated (see §6)                                   |

Themes 1–3 are complete. Theme 4 is the remaining work and is the subject of the companion doc.

---

## 2. Production state (measured 2026-08-27/28)

```
trades              907    all portfolio-linked; 0 carry tradePlanId (field removed)
inboxTrades          31    pending review; grows nightly from IBKR sync
notes                98    85 ticker-tagged, 3 origin:"retrospective"
campaigns             0    table exists, code exists, permanently empty
tradePlans            0    same
retrospectives        0    same — converted to notes
portfolios            4    Long Term, Swing, Bravos, Bravos Model
checkIns             25    stable IDs, delivery + response tracking
positionSnapshots   306    nightly from IBKR OpenPositions
```

Three **archive tables must never be dropped** — they hold the only recoverable copies of documents deleted from production during this epic:

- `planLayerArchives`
- `bravosDanglingReferenceArchives`
- `ibkrDuplicateFillRepairArchives`

Recovery procedure (exercised against production, not theoretical) is documented in PR #165's description: query the archive row by audit token, read `_storage` metadata, fetch the blob via `ctx.storage.getUrl()` + HTTP, verify digest. **`_storage.sha256` is base64 (44 chars) on real Convex — the official docs saying base16/hex are wrong.** Compare decoded bytes, never encoded strings.

### Known pre-existing conditions (not defects introduced here)

- 1 dangling `bravosReviewItems.appliedNoteId` → a note deleted before this epic began. Proven pre-existing via a pre-migration export. Inert; Bravos is deactivated.
- 10 dangling `importTasks.inboxTradeId` → normal accept-flow artifact (inbox row deleted on accept, pointer not cleared). Proven pre-existing against a pre-repair export.
- One pre-existing ESLint warning in `PortfolioCashLedgerSection` (hook dependency). Leave it; every builder brief mentions it so it isn't "fixed" by accident.

---

## 3. What shipped (chronological, with why)

### IBKR ingestion (themes 1)

- **#157** — timezone correction. Eastern wall-clock was being parsed as UTC; 36 rows corrected in production.
- **#158** — order-level ingestion. Identity moved from `ibExecID` (execution) to `ibOrderID` (order), so partial fills of one order collapse into one row instead of several.
- Nightly Convex cron, 05:00 UTC, verified firing on consecutive days. Weekends correctly produce no run.

### Bravos deactivation (theme 3)

- **#137, #141, #145, #147** — feature deactivated (code retained, inactive), then 52 plans / 118 notes deleted and 92 trades unlinked in a gated production run.

### Single-user enforcement

- **#161** — cross-owner authorization regression tests.
- **#162** — `ALLOWED_USER_IDS` allowlist at the `requireUser` choke point, fail-closed. An audit found **117 of 117** public Convex functions gated, with `ctx.auth.getUserIdentity()` appearing exactly once in the repo. The Clerk instance is shared across the owner's other apps, so the app is personal _by policy_, not by accident of who can authenticate.

### Data repairs (three gated production operations, all executed and verified)

| PR   | Operation                  | Effect                                                                                                                        |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| #163 | Bravos dangling references | 1 note deleted, 2 pointers cleared                                                                                            |
| #160 | Plan-layer clean slate     | 10 campaigns, 41 plans, 3 retrospectives deleted; 79 notes detached; 210 trades unlinked; 3 retrospectives converted to notes |
| #164 | Duplicate IBKR fills       | 31 duplicate groups repaired; 29 inbox + 2 trades deleted; execution-format identifiers now **0**                             |
| #165 | —                          | Retired the three spent repair modules (~4,300 lines) once complete                                                           |

Every one followed the same gate: **dry-run producing an audit token → owner reviews per-document evidence → explicit approval bound to that token → single execution → independent post-check re-deriving results rather than reading the tool's own booleans.**

### Counterpart surface (theme 2)

- **#159** — probe service surface (`daily-context`, `add-note`, `log-check-in`).
- **#167** — full read surface: `instrument-context`, `list-notes`, `list-fills`, `strategy-context`, `portfolio-context`; check-in identity moved from `(date, window)` to stable IDs with delivery confirmation.
- **#168** — **`accept-trade`**: the first counterpart _write_ into trade data. A deliberate, owner-authorized reversal of the probe's original "no trade mutation" rule. Also removed the dead `tradePlanId` link from `trades`/`inboxTrades` schema, accept path, and UI.
- **#169** — dropped `ownerId` from the accept body to match the surface convention (no request carries an owner; the server resolves it from its environment).
- **#170** — acceptance receipts (`trades.sourceInboxTradeId`), complete portfolio candidate menus, `fill-discussion-context`.
- **#171, #172** — windowed and clip-corrected the discussion-evidence scan.
- **#173** — ticker + origin badges on notes so the owner can verify what the agent writes. Incidentally fixed vitest: `.test.tsx` files were never matched by the include glob and path aliases were unwired, so **component tests silently did not run**.

---

## 4. The accept loop — how the system now works end to end

This is the core of theme 2 and the thing most likely to be misunderstood.

1. IBKR nightly sync stages fills into `inboxTrades` (unreviewed).
2. The Hermes counterpart reads `daily-context` and surfaces undiscussed fills in a Discord check-in.
3. The owner confirms a fill conversationally.
4. The agent calls `accept-trade`, which books it into `trades` with a portfolio.

**Portfolio inference is the interesting part**, and it encodes the owner's own mental model in his words: every trade belongs to a _group_ that begins when he first opens a position and ends when he finally closes it; adds and trims in between belong to the same group; a group lives in exactly one portfolio.

- Net position for ticker+account (from accepted trades) is **nonzero** → the fill is inside an open group → inherit that group's portfolio silently.
- Net position is **zero** → this is an opening trade → return `needsPortfolio` with the full portfolio menu and ask. Opening is exactly when the owner decides strategy, so asking is correct product behavior.
- Out-of-chronological-order acceptance is refused (`outOfOrder`) — accepting a closing fill first would corrupt flat-point detection.
- Untrustworthy or truncated history refuses to infer rather than fabricating a boundary.

**No episode/group ID is stored.** Boundaries are computed on the fly, deliberately, because Phase 3 owns that schema decision. This is the first concrete implementation of the episode concept and is the best evidence available for Phase 3's design.

Retry safety: `trades.sourceInboxTradeId` is a durable receipt, so a retry after a lost response replays the original `accepted` result with `alreadyAccepted: true` rather than a confusing `NOT_FOUND`.

The Hermes-side rule — **only accept fills the owner confirmed in conversation** — is enforced entirely by the agent, not the server. `fill-discussion-context` exists so that rule survives a session reset: it returns which check-ins surfaced a fill, whether they were answered, and linked note previews. It deliberately reports **evidence only** and never computes a "confirmed" verdict.

---

## 5. The Hermes integration

The counterpart runs on the owner's Hermes instance — **not a Traycer agent**; nothing in this epic can modify it. The interface is the HTTP contract.

**Authoritative contract:** epic artifact `counterpart-read-surface/hermes-http-contract`. Keep it current — it is what the external agent implements against, and it is the only durable channel to that side.

Conventions that matter:

- Bearer `COUNTERPART_TOKEN`; owner resolved from deployment environment.
- **No request ever contains an `ownerId`** — passing one is a `VALIDATION` error. (#168 briefly violated this; #169 fixed it. Don't reintroduce it.)
- Accepted vs pending trades are never merged in a response; the agent must not state pending fills as facts.
- Every position/cash figure carries a source and an `asOf` — broker snapshots go stale across weekends.

**Feedback loop that works:** the Hermes agent reports field problems, and three such reports became #170 directly (idempotent receipts, complete portfolio candidates, `fill-discussion-context`). Treat its reports as high-signal; they come from real usage.

---

## 6. What's next

### Immediately queued

- **Phase 3 — instrument threads/episodes.** The companion doc owns this. **Gated on probe evidence**, decision window **2026-09-14 → 2026-09-25**.
- **Plan-layer code removal** — agreed as Phase 3's opening move, not a standalone cleanup: `campaigns.ts` (577), `tradePlans.ts` (981), `retrospectives.ts` (94), `watchlist.ts` (150), ~20 UI files, plus schema tables. All operate on empty tables. Doing it separately means touching the same files twice.

### The probe gate — read this before proposing Phase 3 work

Terms are recorded in artifact `flywheel-probe-tech-plan`, section "Re-Baseline — 2026-08-27":

- **Baseline Monday 2026-08-31**; decision window is weeks 3–4, **2026-09-14 → 2026-09-25**.
- **Bar: ≥3 answered workdays/week and nonzero notes/week**, judged from `checkIns` alone.
- The clock was re-baselined once because weeks 1–2 measured a system under construction (platform migration, undelivered check-ins). **The bar itself has never moved and must not.** A standing instruction from the probe's design is that it must not soften on good early numbers.
- **Freeze rule:** bug fixes do not reset the clock; changes to the _ritual_ (cadence, windows, message shape, new counterpart write tools) do, and must be recorded. This is the one permitted re-baseline.
- **Only delivered prompts count** — check-ins created but never confirmed delivered are excluded from the denominator. 2026-08-24 is the exemplar: three check-ins created, none delivered; that is an infrastructure defect, not disengagement.

Two of the plan's three original secondary reads are dead: "does the fill pile drain" now measures the accept loop's tooling (the agent drains it), and "bare positions gain plans-from-here" references a table that no longer exists. Surviving reads: does the owner reference past notes; notes per answered day; real use of `instrument-context`/`fill-discussion-context`.

### Deferred, recorded, not forgotten

- **Chart attachments on `add-note`** — needs an upload workflow into Convex storage. Deferred as out of MVP scope; recorded in `docs/product/decision-log.md`. Returns when the flywheel graduates from probe to product, because chart screenshots were named in the original capture pain.
- **`MAX_COUNTERPART_PORTFOLIOS`** has the same lifetime-cap shape that caused a bug in `fill-discussion-context`, but portfolios are user-created and effectively bounded. Known, not urgent.
- **Cross-owner test coverage** on `prepareCounterpartAcceptance` covers the missing-id half but not the foreign-owner half of its guard. Add when next in that file.
- **`tsconfck`** (transitive dev dependency of `vite-tsconfig-paths`) is marked unmaintained. Dev-only, no runtime exposure.

---

## 7. Working rules — each was paid for

These are not style preferences. Each came from something that went wrong.

### Production data operations

**Never proceed on an absent answer.** A gate satisfiable by silence is not a gate. Approval must be explicit and bound to a specific audit token; design approval never implies execution approval. When an agent held execution for hours awaiting confirmation rather than reading silence as consent, that was correct behavior — reinforce it.

**Report before invoking, and treat authorization as re-checkable up to the moment of the call.** A repair once executed inside the window between a GO being issued and an abort arriving. The outcome was correct, but every gate verified the _content_ of the operation and none verified the authorization was still live.

**Verify the bytes that execute.** Reviewing a command's text and then retyping it verifies nothing — a payload lost a closing quote between review and invocation, and separately a document ID lost a character. Write the payload to a file, verify its SHA-256 in the _same shell command_ as the invocation:

```bash
test "$(shasum -a 256 "$P" | cut -d' ' -f1)" = "<digest>" && npx convex run <fn> "$(cat "$P")" --prod
```

`npx convex run` has no `--args-file` at 1.43.0. **Generate payloads mechanically; never transcribe IDs by hand.**

**Take a pre-export.** `npx convex export --include-file-storage` costs seconds and megabytes. It twice settled questions nothing else could — proving that dangling references pre-dated a repair rather than being caused by it.

### Verification discipline

**Neither a mock nor the vendor's docs is production evidence.** A reviewer correctly refused a `convex-test` citation as proof of production behavior, then substituted the official docs — which were also wrong. Only a read against a real deployment settles platform behavior, and it costs one `--inline-query`.

**An unexplained test-count delta is a signal, not noise.** It caught a stale-base PR that proposed deleting 6,684 lines including the entire allowlist, and it caught three component tests that never executed. This applies to an agent's own report before it reaches anyone else.

**Mutation-test rather than trusting green.** The two most consequential findings in this epic were invisible to a passing suite: correct code with nothing defending it, and a fix that relocated a failure rather than removing it. The practice is to break the behavior deliberately and confirm a _specific named test_ fails.

**Watch for assertions that cannot fail.** One test asserted absence of `"RETROSPECTIVE"` where the DOM rendered `Retrospective` (uppercase was CSS). It could never fail.

**Distinguish "corroborated against production" from "taken from a prediction."** One post-check harness produced three consecutive false alarms — all tooling defects, zero data defects. False alarms are corrosive; they train everyone to discount the next one.

### Repo specifics

- **Local `main` goes stale.** Verify base against `origin/main` before creating a worktree or starting work — this bit three separate agents.
- **Symlinked `node_modules`** in a review worktree is fine for vitest/tsc/eslint but breaks `next build` and produces 20 spurious `ibkrFlexWorkflow` failures (a `process is not defined` cascade in the `convex-test` Edge sandbox). Use a real `pnpm install`.
- **Convex validates schema against data on push.** Production being clean does not mean the shared dev deployment is; a schema-field removal failed there on 80 stale rows.
- **One `.paginate()` per Convex function.** A production dry-run once failed closed on this.
- **The repo is PUBLIC.** No owner identifiers, tokens, deployment names, or real note/trade content in PRs, comments, or docs.
- **Playwright uses exact `getByTestId()` only.** Update `shared/e2e/testIds.ts`, helpers, and specs in the same change as a hook.
- **`pnpm agent:up` is long-running**; `pnpm agent:down` when finished. Disk reached 69 GB of worktrees during this epic.

### Agent process

- **PR groups**: builder (codex — Sol for large, Terra for medium, Luna for small) + reviewer (claude Opus, high) + a sitter for larger PRs. Small PRs (a handful of lines) get a reviewer and no sitter; three agents for five lines was correctly called out as waste.
- **The sitter owns coordination**, not the coordinator. Relaying between builder and reviewer wastes the coordinator's context.
- **The merge button is always the owner's.** No agent merges.
- **CodeRabbit is not a blocking gate** — usage-based reviews are unavailable on this plan, so a green check often means rate-limited. The state that must never pass silently is a _real review of a stale head_.
- **A reviewer should not author the fix for its own finding.** One correctly declined and asked for the fix to go elsewhere so it could re-review independently.
- **`prg` needs `--repo Jacksondr5/trade-tracker`** explicitly; it otherwise defaults elsewhere and writes a phantom board row.

---

## 8. Corrections worth carrying

Things believed and later disproven. Recorded because the wrong version propagated into notes and briefs before being caught.

- **`_storage.sha256` is base64 on production, not hex.** Escalated as a production-breaking bug on the strength of official documentation; measurement showed the docs wrong and the original code correct.
- **`convex-test` _does_ enforce the one-paginate-per-function limit** at the pinned versions — an earlier note claimed the mock diverged.
- **"Cosmetic dangling data; no known reader"** was written about an orphan pair in August. A reader appeared eight days later — a safety guard — and blocked a production migration for five days. Phrase findings by what was checked, not by what is assumed absent.
- **A `getArchivePayload` function is not an archive reader.** A blocking review finding assumed the deleted functions read committed archives; they built pre-repair snapshots. No in-repo restore path ever existed.

---

## 9. Where things live

| What                                             | Where                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| Evergreen product/architecture docs              | `docs/product/` — start at `README.md`                   |
| Agent workflows, commands, testing setup         | `AGENTS.md` (CLAUDE.md symlinks to it)                   |
| Dated plans and historical proposals             | `docs/plans/`                                            |
| Epic artifacts (decisions, tickets, audits)      | `~/.traycer/epics/02b031fe-.../artifacts/`               |
| Hermes contract (external agent implements this) | artifact `counterpart-read-surface/hermes-http-contract` |
| Probe design + re-baseline terms                 | artifact `flywheel-probe-tech-plan`                      |
| PR-sitter playbook                               | `~/.traycer/pr-sitter/playbook.md`                       |
| Repo-specific PR exceptions                      | artifact `pr-group-trade-tracker-exceptions`             |

**Doc drift to be aware of:** `docs/product/` still describes campaigns, trade plans and retrospectives as live features. The tables are empty and nothing writes to them. `instrument-threads.md` describes the Phase 3 target, which is unbuilt.

---

## 10. If you do one thing first

Read the companion product handoff, then `docs/product/README.md`, then measure production yourself rather than trusting the numbers in §2 — they were true on 2026-08-28 and the system runs nightly.

Then leave the probe alone until 2026-09-14. The single most valuable thing an incoming agent can do for this project between now and then is **not perturb the ritual being measured**, and spend the window on Phase 3 design instead of Phase 3 construction.
