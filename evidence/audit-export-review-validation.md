# Audit export review validation

Validated on Node.js 24.18.0 against the isolated PostgreSQL 18 fixture at
`127.0.0.1:55545` (`max_prepared_transactions=16`). No fixture credentials are
recorded here or in the test logs.

- `audit-export-review-mutants.log` records the expected failures after
  temporarily restoring the deterministic per-job object key, omitting
  whitespace formula neutralization, and omitting the post-storage
  administrator check. The production sources were restored before the passing
  runs.
- `audit-export-review-focused-tests.log` records the focused export, event,
  audit-policy, recovery, migration-artifact, and migration-upgrade suite.
- `audit-export-migration-provenance.txt` records the regenerated unpublished
  0013 artifact hashes and confirms migrations 0001 through 0012 were not
  modified from the review base.

Static validation:

- `@codaco/studio-server`, `@codaco/studio-rpc`, and
  `@codaco/studio-client` typechecks passed.
- Changed TypeScript files pass Oxlint; `app.ts` reports five existing warnings
  in unchanged surrounding code.
- Changed files pass Oxfmt and Studio schema documentation is current.
- Full Knip remains blocked by 24 unresolved Fresco generated-Prisma imports
  under `~/lib/db/generated/client`; the audit-export changes add no Knip
  finding.
