# Notes Workflow Implementation Contract

**Goal:** Finalize the supported notes ownership model for `JAC-139` by removing trade-attached notes, introducing the v1 evidence contract, and exposing a unified notes feed for downstream notes and retrospective work.

**Scope in this ticket**

- Notes may belong to exactly one of: campaign, trade plan, or no parent.
- Trade-attached notes are unsupported and removed from the schema and query surface after the production cleanup migration runs.
- The global `Notes` page is the cross-context chronological feed for all supported notes.
- Campaign and trade-plan notes remain filtered views of the same unified notes model.
- Strategy and retrospective storage are out of scope here except for ownership boundaries and downstream dependency guidance.

**Ownership boundaries**

- `JAC-139` owns the notes data contract, unified feed query, parent-context metadata, evidence contract, and backend validation.
- `JAC-140` owns the broader notes UX redesign across global and contextual surfaces.
- `JAC-141` owns the strategy document redesign, not note capture.
- `JAC-142` owns retrospective storage and UI, consuming the notes/evidence contract established here.

**Data model**

- `notes` remains the single table for campaign notes, trade-plan notes, and general notes.
- `tradeId` is removed from the supported notes schema.
- `chartUrls` remains temporarily supported as legacy compatibility data while the new `evidence` array becomes the forward contract.
- `evidence` supports either external URLs or Convex storage-backed uploads and is normalized into note query responses.

**Read/write contract**

- `addNote` and `updateNote` accept optional `evidence` alongside the existing `chartUrls` compatibility field.
- `getNotesFeed` returns all notes for the owner with parent metadata (`contextKind`, `contextLabel`, `contextHref`) for the global notes page.
- `getNotesByCampaign`, `getNotesByTradePlan`, and `getGeneralNotes` remain filtered views over the same normalized note shape.
- `generateEvidenceUploadUrl` is the first-pass upload entrypoint for downstream UI work.

**Deployment sequencing**

1. PR 1 deploys the cleanup helpers and deletes legacy trade-attached notes in production.
2. After production confirms zero remaining trade-attached notes, PR 2 removes `tradeId` from the schema and query surface.
3. `chartUrls` is intentionally kept for compatibility in PR 2 so this deploy does not also require an evidence-data migration.
