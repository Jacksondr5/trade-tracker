# Glossary

## Purpose

This document defines the canonical meaning of shared product terms in Trade Tracker.

Use it when a document, screen, or agent needs to know what a term means before deciding how to describe, structure, or present it.

## Core Objects

### Campaign

A strategic container for a higher-level market idea.

Campaigns organize thesis, status, campaign-level notes, and related trade plans.

Lifecycle states:

- `Planning`: the campaign idea is still being formed or structured.
- `Active`: the campaign is live, in force, or presently relevant within the trading process.
- `Closed`: the campaign has completed its active lifecycle.

### Trade Plan

A tactical setup for a specific instrument or expression of an idea.

Trade plans connect thesis to execution and may be linked to a campaign or exist as standalone plans.

Lifecycle states:

- `Idea`: the setup exists conceptually but is not yet ready for close monitoring or execution.
- `Watching`: the setup is developed enough to monitor, but is waiting for price action or conditions to trigger execution.
- `Active`: the trade plan is live, in force, or presently relevant within the trading process.
- `Closed`: the trade plan has completed its active lifecycle.

### Trade

A recorded execution event.

Trades preserve the execution record and may optionally link to a trade plan.

### Note

A time-stamped reasoning record with optional chart screenshots.

Notes may belong to a campaign, a trade plan, or no parent object.

### Strategy

The formal, long-lived operating document for the target user's trading practice.

### Inbox Trade

An imported execution awaiting review and acceptance into the permanent trade record.

Status terms:

- `Pending Review`: the imported or provisional record still requires review before acceptance.

### Portfolio

A capital-allocation bucket used to group trades and exposure.

Portfolios are overlays on the core hierarchy, not the main thesis structure.

### Account Mapping

A translation from a raw brokerage account identifier to a user-friendly account name.

## Relationship Terms

### Standalone Trade Plan

A trade plan that does not belong to a campaign.

Standalone trade plans are valid first-class objects, not incomplete data.

### Linked Trade Plan

A trade plan that belongs to a campaign.

## Focus Terms

### Watchlist

A cross-cutting attention layer for objects that deserve repeated visibility until explicitly removed.

`Watchlist` is separate from lifecycle state.

### Watched

An object that has been added to `Watchlist`.

`Watched` does not imply any particular lifecycle state.

## Distinction Rules

- Keep lifecycle and focus separate.
- Do not use `watching` to mean `on Watchlist`.
- Do not use `priority`, `pinned`, `starred`, and `watched` interchangeably unless the product explicitly adopts one of those terms later.
- Do not treat portfolios as the parent structure for campaigns or trade plans.
- Do not treat standalone trade plans as exceptions or broken data.

## Naming Rule

Use the glossary term itself in product copy unless a document explicitly defines a different display label for that context.
