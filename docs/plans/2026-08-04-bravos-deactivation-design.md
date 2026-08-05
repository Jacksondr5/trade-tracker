# Bravos Deactivation Design

## Decision

Deactivate Bravos without deleting its implementation. The product must no
longer expose a Bravos navigation item or review workspace, and every existing
HTTP entry point must reject requests before it starts Browserbase, AI, or
Convex work.

## Considered approaches

1. **Guard every entry point and remove discovery paths (chosen).** A shared
   server-only guard gives callers a clear 4xx response explaining that Bravos
   is deactivated. Navigation is removed and `/imports/bravos` redirects to
   `/imports`. This keeps re-enablement localized and preserves all code.
2. Delete the routes and UI. This would make the feature harder to restore and
   violates the requirement to retain the code.
3. Hide only the UI. This leaves direct HTTP and scheduled operational paths
   live, which is not a shutdown.

## Data handling

Production data is not modified by this change. The audit will identify
Bravos-created trade plans by their `sourceUrl` (the current domain model uses
that field to classify a plan as Bravos), then count linked trades, notes, and
pending review records. A proposed internal mutation will batch deletion and
report progress, but it will not be invoked without explicit user approval
after the audit.

## Verification

Unit tests will prove disabled route behavior, existing non-Bravos coverage
will be adjusted to stop expecting the removed surface, and the repository
lint, typecheck, test, and build checks will run before opening the PR.
