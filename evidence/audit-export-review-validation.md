# Audit export review validation

Validated on Node.js 24.18.0 against the isolated PostgreSQL 18 fixture at
`127.0.0.1:55545` (`max_prepared_transactions=16`). No fixture credentials are
recorded here or in the test logs.

- `audit-export-review-mutants.log` records the expected failures after
  temporarily restoring the deterministic per-job object key, omitting
  whitespace formula neutralization, and omitting the post-storage
  administrator check. The production sources were restored before the passing
  runs.
- `audit-export-followup-mutants.log` records three expected failures after
  temporarily removing the post-open stream release, the expired-lease renewal
  predicate, and the pre-upload artifact-key fence. The production sources were
  restored before the passing runs.
- `audit-export-review-focused-tests.log` records the focused export, event,
  audit-policy, recovery, migration-artifact, and migration-upgrade suite.
- `audit-export-followup-focused-tests.log` records the expanded focused suite:
  7 files passed, with 74 tests passed and 8 environment-gated tests skipped.
- `audit-export-migration-provenance.txt` records the regenerated unpublished
  0013 artifact hashes and confirms migrations 0001 through 0012 were not
  modified from the review base.

Static validation:

- `@codaco/studio-server`, `@codaco/studio-rpc`, and
  `@codaco/studio-client` typechecks passed.
- Changed TypeScript files pass Oxlint; `app.ts` reports five existing warnings
  in unchanged surrounding code.
- Changed files pass Oxfmt and Studio schema documentation is current.
- Full Knip passed after the parent workspace generated Fresco's Prisma client;
  it reports only two existing redundant-entry configuration hints.
