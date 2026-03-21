# Trade Plan Workspace Implementation Contract

## Purpose

Define the implementation contract for the `Trade Plan Workspace` project before the work fans out into data, index, detail, and relationship-management tickets.

This contract resolves the first-pass field set, page ownership boundaries, and downstream sequencing so the follow-up tickets can implement against a stable target.

## Workspace Role

### Trade-plan index

`/trade-plans` is the tactical workspace entry point for the trade-plan domain.

It should:

- surface both standalone and linked trade plans
- support reorientation and prioritization across lifecycle state and relationship state
- keep lightweight creation available without making creation the main purpose of the page

It should not:

- replace campaign detail as the primary strategic view for campaign-owned ideas
- duplicate local hierarchy shell behavior already owned by navigation

### Trade-plan detail

`/trade-plans/[id]` is the primary tactical working surface for a single trade plan.

It should combine:

- relationship context
- durable tactical setup content
- execution context
- contextual notes placement

It should not become:

- a campaign redesign
- a notes-system redesign
- a generalized imports workspace
- a trade-detail or analytics surface

## Ownership Boundaries

- `JAC-145` owns workspace-ready backend payloads for trade-plan index and detail surfaces.
- `JAC-146` owns the `/trade-plans` page content and presentation.
- `JAC-148` owns trade-plan detail page composition, tactical fields, and execution-context presentation.
- `JAC-147` owns linking, reparenting, and unlinking workflows on trade-plan surfaces.

Outside this project:

- `Navigation, Shell, And Working Context` owns the hierarchy rail, breadcrumbs, watchlist shell behavior, and command palette behavior.
- `Campaign Workspace` owns campaign detail composition and campaign-page strategic summaries.
- `Notes, Strategy, And Retrospective Workflow` owns the shared notes interaction model and notes primitives.
- `Imports And Operational Efficiency` owns generalized inbox throughput and broader import workflow design.

## Final Tactical Field Set

The first-pass tactical editor/read model for trade plans includes:

- `rationale`
- `entryConditions`
- `targetConditions`
- `exitConditions`

These fields are part of the durable trade-plan record and belong on the trade-plan detail workspace.

The following existing schema fields are explicitly out of scope for the first-pass workspace contract:

- `instrumentNotes`
- `instrumentType`
- `invalidatedAt`

Reasoning:

- `instrumentNotes` overlaps too heavily with the unified trade-plan notes stream and should not be surfaced as a second freeform notes surface.
- `instrumentType` does not currently drive product behavior, has no evergreen product definition, and should not be exposed as loose free text.
- `invalidatedAt` should stay deferred until the product defines an explicit invalidation workflow or status behavior that makes the field meaningful.

## Notes Versus Tactical Fields

Trade-plan notes and tactical fields serve different jobs.

- `rationale`, `entryConditions`, `targetConditions`, and `exitConditions` are durable plan content.
- trade-plan notes are time-stamped observations, evidence, and running commentary in the unified notes system.

This project may reposition notes within the trade-plan page flow, but it should not create a second structured-notes system inside the trade-plan record.

## Detail Page Composition

The top-level trade-plan detail composition for this phase is:

1. relationship and identity header
2. tactical plan section
3. execution context section
4. notes section
5. retrospective section

### Relationship and identity header

Must make the following legible:

- plan name
- instrument symbol
- lifecycle status
- standalone versus linked state
- parent campaign context when linked
- page-level watch state if supported by the workspace data contract

### Tactical plan section

Must surface the first-pass tactical fields:

- rationale
- entry conditions
- target conditions
- exit conditions

### Execution context section

Must keep trade and pending-import context visible without becoming an imports redesign.

The section should support:

- linked trade summary context
- linked trade list/table treatment appropriate to the page
- pending inbox context for this plan
- continued ability to accept pending inbox trades into the plan

The UI must distinguish:

- pending trades already assigned to this trade plan
- pending trades that are only symbol matches or suggestions

### Notes and retrospective

- Notes stay in the page flow through the shared notes system.
- Retrospective remains a separate section and should not absorb tactical-field responsibilities.

## Relationship-Management Contract

This phase must support:

- linking a standalone trade plan to a campaign
- moving a linked trade plan to a different campaign
- unlinking a trade plan so it becomes standalone

Rules:

- closed campaign status must not block trade-plan lifecycle changes
- closed campaign status must not block relationship changes
- campaign-page changes are allowed only for narrow compatibility or consistency fixes

## Data-Contract Guidance

`JAC-145` should provide stable workspace payloads for:

- trade-plan index summaries
- trade-plan detail workspace data

The payloads should include:

- identity and lifecycle fields
- relationship metadata
- watch state needed by touched surfaces
- execution rollups needed by index/detail UI

They should not include:

- analytics-first metrics that do not directly support the workspace
- unused fields that this contract intentionally deferred

## Recommended Sequencing

1. `JAC-145` establishes the workspace data contract.
2. `JAC-146` redesigns the index against that contract.
3. `JAC-148` rebuilds the detail workspace against that contract.
4. `JAC-147` lands relationship-management flows after the detail/header shape is stable.

## Downstream Ticket Adjustments

The downstream tickets should assume:

- `instrumentNotes` is removed from the first-pass workspace scope
- `instrumentType` is removed from the first-pass workspace scope
- `invalidatedAt` is deferred from the first-pass workspace scope
- `rationale`, `entryConditions`, `targetConditions`, and `exitConditions` are the only new tactical plan fields required for the initial detail rebuild
