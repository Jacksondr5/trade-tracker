# Import Development Data Reset Guidance

When introducing schema-breaking changes for brokerage import work, this project treats existing development data as disposable.

## Rule

- If Convex schema enforcement blocks deployment because existing rows are incompatible, delete existing development data and continue.
- Do not assume a migration path for pre-import development data.
- After reset, rerun `npx convex dev` and validate the import inbox flow.
