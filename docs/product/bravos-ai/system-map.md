# Bravos AI System Map

## Purpose

This document provides the broad architectural map for Bravos AI in Trade Tracker.

Use it when deciding:

- which major design areas belong to the Bravos AI system
- how those areas relate to one another
- what should be considered `V1`, `V1.5`, and `V2`
- where deeper design work should be focused next

This document is intentionally broad. It is the anchor for future design work, not a detailed implementation plan.

Use the more focused docs in this directory for deeper guidance on:

- the assistant's purpose and behavior
- knowledge representation
- source shaping and citation strategy

## Summary

Bravos AI is not one feature. It is a coordinated system made up of several connected layers:

1. source ingestion and normalization
2. layered knowledge storage and retrieval
3. assistant runtime and reasoning behavior
4. curation and review workflows
5. user-facing assistant and source-inspection UX
6. evaluation, operations, and governance

An additional future layer connects the assistant to the user's internal Trade Tracker data.

The product should be designed broadly across all of these areas before implementation gets too deep in any one of them.

## Workstreams

### 1. Source Ingestion And Normalization

This workstream is responsible for collecting Bravos content and shaping it into forms that the knowledge system can use.

It includes:

- source acquisition for posts, PDFs, and YouTube videos
- source identity, deduping, and change detection
- transcript cleanup and normalization
- semantic segmentation for videos and long-form content
- preprocessing of PDFs, text posts, and attached images
- screenshot hooks and timestamp mapping for future multimodal use
- extraction jobs that produce candidate knowledge units

This is not just scraping. It is the first meaning-shaping layer.

### 2. Knowledge Representation And Storage

This workstream defines how Bravos material is stored after ingestion and how the assistant finds it.

It includes:

- raw source storage
- normalized source storage
- curated knowledge-unit storage
- retrieval indexes for fast lookup
- provenance and citation metadata
- confidence and review-state metadata
- separation of `trading-system`, `macro-economic-conditions`, and `durable-market-principles`

This is the core data layer behind the assistant.

### 3. Agent Runtime And Reasoning Workflow

This workstream defines the behavior of the sounding-board assistant itself.

It includes:

- conversational intake of trade ideas
- clarification and follow-up questioning
- the `system fit` and `macro fit` evaluation gates
- curated-first retrieval
- bounded source drill-down
- visible reporting of reasoning and actions
- verdict logic, uncertainty handling, and escalation behavior

This is the decision-making layer, not the storage layer.

### 4. Curation And Review UX

This workstream governs how the system stays healthy over time.

It includes:

- reviewing newly ingested knowledge
- approving, editing, rejecting, or merging extracted knowledge units
- checking citation spans and timestamp ranges
- identifying extraction failures and pipeline drift
- managing review status, confidence, and exceptions

This area is critical because Bravos AI depends on knowledge quality and not just retrieval speed.

### 5. End-User Assistant And Source UX

This workstream defines how the product feels when the user actually interacts with Bravos AI.

It includes:

- the sounding-board conversation interface
- the presentation of reasoning sections and verdicts
- compare-and-contrast flows for multiple ideas
- source citations and source links
- transcript, document, and future screenshot drill-down views
- ways to inspect what the assistant checked and why

This should feel more deliberate than a generic chat surface.

### 6. Evaluation, Operations, And Governance

This workstream makes the system measurable and durable.

It includes:

- extraction-quality evaluation
- retrieval-quality evaluation
- verdict-quality evaluation
- monitoring for knowledge drift and ingestion failures
- freshness and reingestion policy
- versioning and provenance tracking
- latency and cost management
- legal or policy constraints around source handling

This needs to be a first-class design area even if some of its implementation lands after the initial product surface settles.

### 7. Future Personalization And Trade Tracker Context

This is the future workstream that connects Bravos AI to the user's own trading system inside Trade Tracker.

It includes:

- campaigns
- trade plans
- portfolios
- positions
- existing notes and strategy context
- future personalized critique using the user's own behavior, exposure, and process history

This should remain outside V1 scope, but the earlier layers should avoid blocking it.

## Layered System View

At a high level, the system should work like this:

1. ingest and normalize Bravos content
2. shape it into layered knowledge
3. retrieve curated knowledge first during assistant runtime
4. drill into deeper linked source material when needed
5. present a firm, citation-backed judgment to the user
6. let the user inspect and curate what the system learned
7. evaluate and refine the system over time

This means the assistant is not just a RAG interface.

It is better understood as:

- a grounded Bravos knowledge assistant
- backed by retrieval
- backed by source drill-down
- backed by curation and evaluation loops

RAG is one component of the architecture, not the full product definition.

## Scope By Phase

### V1

V1 should focus on the core Bravos-only sounding-board experience.

It should include:

- Bravos source ingestion and preprocessing foundations
- layered knowledge storage
- separate `trading-system`, `macro-economic-conditions`, and `durable-market-principles` corpora
- curated-first retrieval
- bounded source drill-down into linked material
- visible reasoning and visible action reporting
- the core sounding-board UX for trade ideas
- source citation and source inspection basics
- the curation workflow needed to keep new ingestion usable

Current V1 working assumptions include:

- `trading-system` is important and bounded enough to support full manual review
- `macro-economic-conditions` and `durable-market-principles` will need to trust auto-extracted knowledge by default
- the system should preserve review status and confidence metadata even before it uses them heavily in runtime weighting

V1 should not include:

- integration with internal Trade Tracker data
- portfolio-aware critique
- campaign-aware or trade-plan-aware reasoning
- broad autonomous recommendation behavior
- full multimodal screenshot interpretation

### V1.5

`V1.5` is the system-hardening and governance layer that should be designed for from the start but may land after the core user workflow is usable.

It should include:

- stronger evaluation harnesses
- better operational monitoring
- knowledge freshness and reingestion policy
- versioning of knowledge units and extraction outputs
- clearer governance around review state and trust
- stronger curation tooling once the initial product surface has settled

This phase is important because early product behavior will likely shift as the system is tuned. It is reasonable to let some of this area mature after the core assistant loop is visible and testable.

### V2

V2 should expand the system beyond Bravos-only reasoning into personalized trading support.

Previously discussed V2 items include:

- connecting the assistant to campaigns
- connecting the assistant to trade plans
- connecting the assistant to portfolios and positions
- allowing portfolio-wide risk review and improvement suggestions
- evaluating proposed ideas against the user's current exposure and existing plans
- more personalized critique using the user's own process history
- broader internal context integration across Trade Tracker

Other previously discussed future-scope items that fit V2 or later include:

- screenshot capture from video timestamps for cited source review
- richer multimodal inspection when transcript text is not sufficient
- more powerful source drill-down workflows beyond basic transcript inspection
- broader archive-style exploration once the sounding-board workflow is strong
- heavier ontology or knowledge-graph modeling once the retrieval model proves out
- richer review-state weighting once enough content has actually been reviewed

These items should remain future-facing unless they become necessary to support the core V1 sounding-board experience.

## Key Design Areas That Still Need Deeper Work

The broad workstreams are now identified, but several design areas still need deeper treatment:

- the exact source-ingestion and extraction workflow
- the final knowledge-unit schema and metadata contract
- the runtime agent workflow and state model
- the curation and review interaction model
- the assistant UI and source-inspection UX
- the evaluation and governance framework
- the eventual Trade Tracker context-integration model

These should be handled as separate design efforts rather than forced into one oversized plan.

## Relationship To Other Bravos AI Docs

- [knowledge-base.md](./knowledge-base.md) defines the purpose, behavior, and boundaries of the Bravos-grounded assistant
- [knowledge-representation.md](./knowledge-representation.md) defines how source material should be segmented, stored, cited, and inspected
- [future-scope.md](./future-scope.md) captures future-facing Bravos AI work outside the core `V1` loop

Use this document to understand the whole map first, then move into the more specific docs as needed.

## Summary

The Bravos AI effort should be treated as a multi-workstream system, not as a single feature.

The current high-level design surface includes:

- source ingestion and normalization
- knowledge representation and storage
- assistant runtime and reasoning
- curation and review workflows
- end-user assistant and source UX
- evaluation, operations, and governance
- future Trade Tracker context integration

The recommended sequencing is:

- build the Bravos-only sounding-board core in `V1`
- harden and govern it in `V1.5`
- expand into personalized Trade Tracker context in `V2`
