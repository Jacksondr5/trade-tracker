# IBKR Expected-Account Migration Runbook

This is the production bridge between the legacy single `accountId` field and
the canonical `expectedAccountIds` list. The bridge deployment deliberately
keeps the current public `accountId` API working while storing all new account
metadata writes in `expectedAccountIds`.

Do not merge the narrowing follow-up until this runbook completes against
production.

## Deploy The Bridge

1. Merge and deploy the independently validated migration-bridge PR.
2. Confirm the production deployment is healthy before running the migration.
3. Do not edit the IBKR connection while the checks below are in progress.

## Precheck

```bash
pnpm exec convex run brokerageConnectionMigrations:verifyAccountIdMigration '{}' --prod
```

- `complete: true` with an empty `remainingConnectionIds` list is success. The
  bridge has already canonicalized every document, so skip directly to the
  final verification section.
- `complete: false` means legacy documents remain. Review the count and IDs,
  then continue with the dry run.
- A safety-bound error or an unexpected document count is a stop condition.
  Leave the wide bridge deployed and escalate before changing data.

## Dry Run And Apply

```bash
pnpm exec convex run brokerageConnectionMigrations:migrateAccountIdToExpectedAccountIds '{"dryRun":true}' --prod
```

Review `examined` and `wouldMigrate`. The migration is bounded to 100 total
brokerage connections and fails without writing if that bound is exceeded.
The expected production shape at authoring time is one connection, but the
live precheck is authoritative.

When the dry-run result is understood:

```bash
pnpm exec convex run brokerageConnectionMigrations:migrateAccountIdToExpectedAccountIds '{"dryRun":false}' --prod
```

The migration trims the legacy value, merges it with any existing expected
list without duplication, clears `accountId`, and is safe to rerun.

## Final Verification And Narrowing Gate

```bash
pnpm exec convex run brokerageConnectionMigrations:verifyAccountIdMigration '{}' --prod
```

Require both:

- `complete: true`
- `remainingConnectionIds: []`

If either condition fails, keep the wide bridge deployed and rerun the
idempotent migration only after reviewing the remaining documents. Escalate
unexpected state; do not merge or deploy the schema-narrowing follow-up.

Once verification is clean, record the command output on the narrowing PR.
That PR may then remove legacy `accountId`, the old-client bridge, and these
temporary migration functions as one deployment.
