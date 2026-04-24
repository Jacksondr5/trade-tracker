# Bravos AI Future Scope

## Purpose

This document captures future-facing Bravos AI work that is intentionally outside the core `V1` scope.

Use it to:

- keep later ideas visible without forcing them into near-term design
- distinguish `V1.5` hardening work from broader `V2+` expansion
- preserve future directions that have already been discussed

This is a holding document for future scope, not a commitment to order or timing.

## Scope Framing

`V2+` is intentionally a broad later bucket rather than a tightly ordered release.

The immediate sequencing for Bravos AI is:

- `V1`: build the Bravos-only sounding-board core
- `V1.5`: harden, measure, and govern that core
- `V2+`: expand into richer capabilities once the core loop has proven itself

This means the items in this document are future-facing, but they do not need strict internal ordering yet.

## V1.5 Hardening And Governance

These items are important enough to design for now, but they do not all need to ship in the first usable version.

- stronger extraction and retrieval evals
- better operational monitoring
- knowledge freshness and reingestion policy
- versioning of knowledge units and extraction outputs
- stronger curation tooling after the initial workflows settle
- clearer governance around review state, confidence, and trust
- potential runtime use of review status once enough content has actually been reviewed

## Personalized Trade Tracker Context

These items move the assistant beyond Bravos-only reasoning and into personalized trading support.

- connect the assistant to campaigns
- connect the assistant to trade plans
- connect the assistant to portfolios and positions
- evaluate ideas against current exposure and existing plans
- support portfolio-wide risk review and improvement suggestions
- incorporate existing notes and strategy context
- provide more personalized critique based on the user's own process history

These items are explicitly out of `V1` scope.

## Source And Retrieval Expansion

These items deepen how the assistant interacts with source material.

- screenshot capture from video timestamps for cited source review
- richer transcript-plus-visual inspection
- more powerful source drill-down workflows beyond basic transcript inspection
- broader archive-style exploration once the sounding-board workflow is strong
- more specialized sub-agent flows for source investigation when needed

These items should only move forward once the simpler transcript-first and citation-first model has proven valuable.

## Rolling Context And Watch Items

The following future-facing ideas should be discussed further rather than assumed into `V1` immediately:

- maintaining rolling summaries of repeated topics across prior videos
- deriving `things to watch` that can be carried forward into later videos
- giving a summarization agent bounded prior context so it can detect what is changing versus what is being reinforced
- separating rolling-summary maintenance from the primary source extraction flow so cross-video summaries do not overwrite source-level knowledge
- evaluating multiple approaches to this rolling-context layer to understand which one yields the most useful knowledge

This area looks promising, especially for repeated macro themes and durable knowledge that accumulates over time, but it likely needs experimentation before it should shape the core `V1` extraction workflow.

## Multimodal And Visual Understanding

The following items have been discussed as possible future directions:

- chart-aware review during source drill-down
- screenshot-driven enrichment during extraction
- specialized chart-reading sub-agents if visual reasoning proves important

These should remain future-facing until the team has stronger evidence that transcript-first handling is insufficient.

## Knowledge Modeling Expansion

These items expand the sophistication of the knowledge layer itself.

- richer weighting of reviewed vs unreviewed knowledge
- more advanced trust policy once manual review coverage grows
- heavier ontology or knowledge-graph modeling
- broader cross-source synthesis features once grounding quality is strong enough
- revisiting whether `market-history` should remain a lens inside `macro-economic-conditions` or eventually become a more distinct layer

These are meaningful directions, but they should not complicate the initial `V1` design before the simpler retrieval-backed system is validated.

## Runtime And Interaction Expansion

These items broaden the assistant beyond the core initial sounding-board behavior.

- more nuanced user pushback and override handling
- richer multi-turn negotiation around trade disagreements
- broader archive exploration and advisory workflows beyond trade review
- more autonomous agent flows when the product has stronger evaluation and safety foundations

For now, the assistant should remain firm and not optimize around user override behavior.

## Summary

`V2+` should be treated as a future bucket, not as a tightly ordered release plan.

The important distinction is:

- `V1` builds the core Bravos-only assistant
- `V1.5` hardens and governs it
- `V2+` broadens it into richer source, multimodal, and personalized capabilities
