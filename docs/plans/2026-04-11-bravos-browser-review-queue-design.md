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

The daily Convex cron should start a Browserbase session using the saved `contextId` and crawl the configured Bravos listing URL.

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
- source metadata such as listing URL, source URL, published timestamp, and fetched timestamp
- raw capture payload such as normalized text, optional HTML, image URLs, and optional screenshot evidence
- derived classification such as `initiate`, `follow_up`, or `unknown`
- extracted structured proposal
- suggested trade-plan matches and reasoning
- workflow state
- approval result when applicable
- lightweight operational fields such as `lastFetchedAt`, `lastProcessedAt`, `fetchSource`, and `processingError`

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

## Migration Direction From Current Flow

The current `Import from Bravos` path should move away from pasted text and manual chart URLs.

Recommended migration direction:

- retire the current Bravos pasted-text/manual-image workflow as the primary path
- replace it with browser-based manual actions:
  - `Run scan now`
  - `Fetch specific post`
- keep `importTasks` only if needed as an internal async task pattern, not as the core Bravos review object

## Testing Boundaries

Testing should focus on system behavior rather than relying entirely on live Bravos pages.

Required coverage areas:

- unit tests for canonical source identity and dedupe rules
- unit tests for suggested match logic and approval branching
- backend tests for connection status transitions and approval mutations
- scraper-module tests using HTML or payload fixtures for Bravos page shapes
- app-owned browser tests for connect/reconnect triggers and review approval boundaries

## Open Follow-Up

This document intentionally does not define the final page composition, interaction design, or visual language of `/imports/bravos`. A later design pass can handle those concerns once the workflow and data boundaries are implemented.
