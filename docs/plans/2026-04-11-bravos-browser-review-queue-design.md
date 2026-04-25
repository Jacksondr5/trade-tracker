# Bravos Browser Review Queue Design

## Summary

Trade Tracker should replace the current manual Bravos paste-based import flow with a browser-native ingestion workflow backed by Browserbase.

The system should:

- connect to Bravos once through a live Browserbase login session
- reuse Browserbase auth state for scheduled daily scans
- crawl a configured Bravos listing URL to discover posts
- create durable Bravos review items for both scheduled and manual fetches
- suggest matches and proposed actions without mutating canonical records until the user explicitly approves them

This design treats Bravos posts as a distinct operational workflow from brokerage trade imports. The review queue should live at `/imports/bravos`, while brokerage imports remain on `/imports`.

The architecture intentionally uses Convex as the durable workflow coordinator and source of truth, while allowing a specialized internal worker runtime for Browserbase capture and AI-heavy processing. This is the first planned use of the operational-worker caveat in `docs/product/technical-architecture-overview.md`.

## Goals

- Replace the current manual Bravos post import flow with a browser-based ingestion pipeline
- Support scheduled daily scans via Convex cron
- Support manual `Run scan now` and manual `Fetch specific post` workflows
- Reuse Browserbase auth state without storing Bravos credentials in Trade Tracker
- Create one shared review queue for scheduled and manual Bravos ingestion
- Keep all Bravos-derived mutations review-first and user-approved

## Non-Goals

- Mixing Bravos review items into the existing brokerage imports page
- Preserving the current pasted-text plus manual chart-URL entry flow as a long-term workflow
- Storing Bravos usernames or passwords in Convex
- Building revision-history storage for re-fetched Bravos items
- Designing final page visuals or interaction styling in this document

## Current-State Problem

The existing Bravos flow depends on the user manually copying post text and image URLs into the app. That makes the workflow slower than the product intent, loses fidelity from the source page, and creates a second ingestion path that diverges from what a future scheduled sync would need.

The current `importTasks` flow is also the wrong long-term abstraction for this problem. It works as a transient processing/task pattern, but Bravos ingestion needs a durable review object that preserves source evidence, extracted proposals, suggested matches, and approval state.

## Core Decisions

- Browserbase-backed browsing replaces the current manual Bravos paste workflow
- Trade Tracker stores Browserbase `contextId` and sync metadata, but not Bravos credentials
- Users authenticate Bravos by typing credentials into a live Browserbase session during `Connect Bravos`
- Daily sync uses a configured Bravos listing URL and the saved Browserbase context
- Both scheduled scans and manual fetches create the same durable Bravos review items
- The system may suggest classification, trade-plan matches, and follow-up targets, but nothing is committed until approval
- Manual re-fetch of an already-seen post updates the existing review item in place
- Bravos review lives on `/imports/bravos`, separate from brokerage imports on `/imports`
- The dashboard gets a `Bravos Sync` card for connection and sync status plus quick actions
- Convex owns Bravos connection records, review items, sync runs, dedupe, approval state, and canonical trade-plan or note mutations
- A protected internal Next.js route handler acts as the worker for Browserbase sessions, page capture, AI extraction, and heavyweight source processing
- The worker receives bounded job identifiers such as a `syncRunId` or review item id and writes results back through explicit Convex functions
- Convex dispatches worker processing through internal scheduled actions that call the protected worker route with a shared secret
- Client-facing Next.js Bravos routes are separate from the internal worker route and must be guarded by Clerk user auth
- The first implementation should prove manual direct-post fetch before adding listing scans, cron, dashboard actions, or removal of the legacy paste dialog

## Runtime Boundary

Convex remains the system of record for this workflow. It should own:

- Bravos connection configuration and status
- review item identity, dedupe, state, and approval fields
- sync-run records and operational status
- trade-plan match suggestions once normalized inputs are available
- all canonical mutations to trade plans and notes

The internal worker runtime should own:

- creating or reusing Browserbase sessions
- opening Browserbase Live View sessions for login
- capturing listing and post pages
- normalizing raw page material into bounded text, image URLs, screenshots, and metadata
- running AI extraction or classification
- reporting capture, extraction, and processing results back to Convex

The worker must not become a second product backend. It should not persist independent workflow state or apply canonical trade-plan changes directly.

## Dispatch And Authentication Model

Manual UI actions and scheduled scans should both enter through Convex-owned workflow state.

For manual actions:

1. The signed-in user triggers a client-facing route or Convex mutation such as `Fetch specific post`.
2. That entry point verifies Clerk/Convex user auth and creates a `bravosSyncRuns` record.
3. Convex schedules an internal dispatch action with `ctx.scheduler.runAfter(0, ...)`.
4. The dispatch action calls the protected internal Next.js worker route with the `syncRunId`.

For scheduled scans:

1. Convex cron calls an internal mutation that creates a `listing_scan` sync run.
2. That mutation schedules the same internal dispatch action with `ctx.scheduler.runAfter(0, ...)`.
3. The dispatch action calls the same protected internal worker route.

This follows Convex's recommended split for side effects: mutations own transactional state changes, while actions perform external `fetch` calls. Scheduled actions are not automatically retried, so sync-run state must support manual retry or recovery when dispatch or processing fails.

The internal worker route should be server-to-server only:

- route: `/api/internal/bravos/run`
- method: `POST`
- auth: `Authorization: Bearer ${BRAVOS_WORKER_SECRET}`
- body: `{ "syncRunId": "..." }`

`BRAVOS_WORKER_SECRET` must be configured in Vercel so the Next.js route can verify requests. If Convex dispatches the route directly, the same secret and the worker route URL must also be configured in the Convex deployment environment.

Client-facing routes should be separate from the internal worker route. They may be useful for actions that need Next.js server capabilities, such as creating a Browserbase Live View login session. They must use Clerk auth and only create or request Convex workflow state; they must not bypass Convex review state or call canonical trade-plan mutations directly.

## Browserbase Strategy

### Connection bootstrap

The user should connect Bravos through a live Browserbase browser session launched from Trade Tracker.

Flow:

1. User clicks `Connect Bravos`
2. Trade Tracker creates a Browserbase session with a fresh context
3. The user enters Bravos username and password directly on the Bravos login page
4. Browserbase persists the authenticated context
5. Trade Tracker stores only the resulting `contextId` and connection metadata

Trade Tracker should not store the Bravos username or password.

### Scheduled crawl

The daily Convex cron should create a sync run and ask the internal worker to process it. The worker should start a Browserbase session using the saved `contextId` and crawl the configured Bravos listing URL.

Browserbase should be responsible for:

- authenticated page access
- navigating the listing page and post detail pages
- capturing raw source material from Bravos pages

Trade Tracker should be responsible for:

- dedupe
- normalization
- AI extraction
- match suggestions
- review workflow
- approval mutations

In practice, Convex owns the workflow and canonical state, while the internal worker performs the browser and AI-heavy steps and returns bounded normalized results.

### Manual backup workflows

The browser-based ingestion system should also support:

- `Run scan now`: one-off crawl from the configured listing URL using the normal dedupe rules
- `Fetch specific post`: one-off fetch of a direct Bravos post URL, even if the post is older than the current scan cursor

These replace the current manual pasted-text import path for Bravos.

## Route And Workspace Model

The Bravos review queue should be a dedicated imports subroute:

- `/imports` for brokerage imports
- `/imports/bravos` for Bravos review

This keeps both workflows grouped under imports without forcing incompatible operational data into one page or table.

The dashboard should expose a `Bravos Sync` card that links into `/imports/bravos` and surfaces connection and sync state.

## Data Model

This workflow should introduce dedicated Bravos-specific operational records rather than stretching `importTasks` into the primary storage model.

### Bravos connection

One durable connection record should store:

- configured Bravos listing URL
- Browserbase `contextId`
- connection status
- last successful sync timestamp
- last failed sync timestamp
- reconnect requirement state

### Bravos review item

One durable review item should represent one Bravos post.

It should store:

- canonical source identity such as stable Bravos post id and/or normalized source URL
- source metadata such as listing URL, source URL, source post date or published timestamp, and fetched timestamp
- bounded source capture such as normalized text, image URLs, optional screenshot evidence, and selected metadata
- derived classification such as `initiate`, `follow_up`, or `unknown`
- extracted structured proposal as a typed action union, not an unstructured JSON blob
- suggested trade-plan matches and reasoning
- workflow state
- approval result when applicable
- lightweight operational fields such as `lastFetchedAt`, `lastProcessedAt`, `fetchSource`, and `processingError`

Raw HTML should not be stored by default. Store it only behind an explicit debugging decision because it can be noisy, large, and harder to reason about for privacy and retention.

The proposed action should be shaped as one of:

- `create_trade_plan`
- `apply_follow_up`
- `note_only`
- `unknown`

Approval should record enough result data to prevent accidental double-application, such as `approvedAt`, `approvedAction`, `appliedTradePlanId`, and `appliedNoteId` where relevant.

Follow-up proposals must carry the post's source date separately from fetch, process, or review-item creation time. When approval applies a follow-up update to a trade plan field, the appended date prefix should use the source post date extracted from the Bravos page or post text. If the source date is unavailable, the proposal should surface that uncertainty for review rather than silently using the import or processing date.

### Sync or fetch run

A thinner operational record should capture crawl-level execution state for observability and debugging.

It should cover:

- scheduled scan runs
- manual `Run scan now` runs
- manual `Fetch specific post` runs

This object is for telemetry and troubleshooting, not for user approval state.

## Review Queue Workflow

Bravos review items are the approval boundary.

Flow:

1. Browserbase captures a Bravos post
2. Trade Tracker persists or refreshes the corresponding Bravos review item
3. Extraction and matching produce a proposed action and suggested target trade plan when relevant
4. The user reviews the source material, extracted proposal, and suggested match
5. The user may edit the proposed fields or choose a different target trade plan
6. Only explicit approval applies mutations to canonical trade-plan or notes data

Possible approval outcomes:

- `create_trade_plan`
- `apply_follow_up`
- `note_only`
- `dismiss`

The system may suggest a target trade plan, but it must not commit that relationship automatically.

## Dedupe And Re-Fetch Rules

Scheduled and manual scans should dedupe by canonical source identity, not just by recency.

Rules:

- Scheduled daily scans create review items only for unseen posts
- Manual `Run scan now` uses the same dedupe rules as scheduled scans
- Manual `Fetch specific post` may target an already-seen post
- If `Fetch specific post` finds an existing review item, it updates that item in place
- No revision-history table or revision chain is required for re-fetched posts

The system should still keep a scan cursor or last-seen metadata for crawl efficiency, but canonical dedupe should rely on post identity.

## Failure And Reconnect Behavior

Failure should stop short of mutating canonical trade-plan data.

Rules:

- If Browserbase auth is invalid, the sync run fails fast and the Bravos connection becomes `needs_reconnect`
- If the listing page structure has changed and expected content cannot be found, the run is marked failed
- If one post fails extraction or classification, that post may become `needs_attention` or `failed` without necessarily failing the whole scan
- Reconnect uses the same live Browserbase login flow as initial connection

The dashboard card and `/imports/bravos` should surface:

- connection status
- last successful sync
- last failed sync
- pending review count
- reconnect requirement when present

## Approval Mutation Rules

Review approval is the only place where Bravos-derived data becomes canonical.

Approval may:

- create a new trade plan from an initiate post
- apply follow-up updates to a suggested or user-selected existing trade plan
- create a note/evidence-only record
- dismiss the review item

Approval should be idempotent enough to prevent accidental double-application.

When approval applies follow-up field updates, date-stamped appended text should use the review item's source post date. This fixes the legacy paste import behavior where follow-up updates were dated from the import task creation time, which could be later than the actual Bravos post.

## Migration Direction From Current Flow

The current `Import from Bravos` path should move away from pasted text and manual chart URLs.

Recommended migration direction:

- build the browser-backed direct post fetch path first
- prove capture, extraction, review, and approval end to end for one post URL
- add listing-page scans after the direct-post path is reliable
- add scheduled daily scans after manual listing scans are reliable
- retire the current Bravos pasted-text/manual-image workflow only after the browser-backed review path is proven
- keep `importTasks` only if needed for unrelated legacy flows, not as the core Bravos review object

## Testing Boundaries

Testing should focus on system behavior rather than relying entirely on live Bravos pages.

Required coverage areas:

- unit tests for canonical source identity and dedupe rules
- unit tests for suggested match logic and approval branching
- backend tests for connection status transitions and approval mutations
- scraper-module tests using HTML or payload fixtures for Bravos page shapes
- worker-route tests or integration tests for protected job execution boundaries
- app-owned browser tests for connect/reconnect triggers and review approval boundaries

## Open Follow-Up

This document intentionally does not define the final page composition, interaction design, or visual language of `/imports/bravos`. A later design pass can handle those concerns once the workflow and data boundaries are implemented.

The exact worker deployment constraints should be validated during implementation. If the internal Next.js route handler is not suitable for Browserbase or AI processing in production, the same runtime boundary can move to a separate worker process while keeping Convex-owned state and approval semantics unchanged.
