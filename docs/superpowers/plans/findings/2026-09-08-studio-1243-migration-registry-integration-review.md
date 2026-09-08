# Studio 1243 migration and Registry integration review

This note records the bounded integration sources, seam inventory, verification
commands, and persistent local evidence for commits
`ba1074dd294061f431419ca9cb28e0bf46ae3ca4` and
`bcab279fb51e2ac9af2484aa9c00bf27953aeeb9`.

## Integration boundary

- The shared migration engine at `ba1074dd` was retained byte-for-byte. The
  Registry configures it with its own `registry_app`, `registry_operator`, and
  `registry_backup` roles; `registry_migrations.history`; the
  `registry_schema_fingerprint` table; and advisory lock key
  `4021775688147131`.
- Registry migration, runtime, operator, and backup URLs remain separate. The
  migration and operator entry points pass both the allowed-login inventory and
  the copied administrative-login inventory to the shared engine.
- `apps/template-registry/migrations/0001_initial/**` matches `c80e5031b`
  exactly. `apps/studio/server/migrations/**` matches `ba1074dd` exactly.
- The Registry tree comes from `c80e5031b`, including the Registry-only database
  admission, isolated configuration, credential retention, partial-write
  cleanup, and quarantined recovery work between `0a23c1e89` and `c80e5031b`.
  Only the exact diffs from `06550df90` and `2eb62d8d2` were then applied for
  the shared Registry client and its response-bound hardening.
- No Studio publication record, account linking, import UI, Studio recovery
  migration, hosting mutation, or older shared PostgreSQL implementation is in
  this integration.

## Shared-seam call-site inventory

The old duplicated Registry credential regex was removed from the HTTP bearer
parser, store, and account API. Those three call sites now use
`RegistryCredentialSchema`. The account publisher response now aliases
`RegistryPublisherSchema`, and the public entry summary/detail contract now
aliases `RegistryEntrySummarySchema` and `RegistryEntrySchema`. Store output,
the oRPC contract, the account client, and the bounded Node client therefore
parse one wire definition.

The only production Registry migration-engine call sites are `src/migrate.ts`
and `src/operator.ts`. Both pass `allowedLogins` and `administrativeLogins`;
the operator preflight also passes both lists to `enforceSecurity`. Direct test
calls use the database owner where they test schema behavior, except the
dedicated non-owner test, which proves an omitted secondary CREATEROLE
administrator is refused before history is created and the same inventory is
accepted when passed explicitly.

No Studio consumer calls the new `TemplateRegistryClient` yet. Its current
call sites are its bounded response mutants and the Registry instance
conformance test. Studio publication and import adoption is intentionally a
later integration, so adding an incomplete Studio call site here would cross
the agreed boundary.

## Verification and evidence

All commands prepend Node 24 with:

```sh
PATH=/Users/jmh629/.local/share/fnm/node-versions/v24.18.0/installation/bin:$PATH
```

The shared migration integration was verified before `ba1074dd` with the five
Studio migration files (263 tests, including all 154 security tests), the
shared artifact/authoring/config tests (33 tests), and the shared real
PostgreSQL admission suite (10 tests), followed by repository typecheck, lint,
Knip, and changeset checks. Its isolated PostgreSQL 18 instance was port 55538
with `max_prepared_transactions=10`. The exact Studio command is:

```sh
DATABASE_URL=postgres://postgres:spike@127.0.0.1:55538/postgres \
pnpm --filter @codaco/studio-server exec vitest run \
  src/db/migrations/__tests__/artifact.test.ts \
  src/db/migrations/__tests__/authoring.test.ts \
  src/db/migrations/__tests__/migrate.test.ts \
  src/db/migrations/__tests__/security.test.ts \
  src/db/migrations/__tests__/registry-config.test.ts
```

Registry evidence is stored under the persistent ignored directory
`/Users/jmh629/.codex/worktrees/afe1/network-canvas-monorepo/.claude/worktrees/studio-1243/registry-integration/.claude/evidence/studio-1243-registry-integration/`:

| Log                 | Command and result                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `registry-pg18.log` | `PGPORT=55540 PGPASSWORD=spike pnpm --filter @codaco/template-registry exec vitest run` — 370/370                                      |
| `studio-sync.log`   | `PGPORT=55540 PGPASSWORD=spike pnpm --filter @codaco/studio-sync test` — 523/523                                                       |
| `account.log`       | `pnpm --filter @codaco/template-registry test:account` — 12/12                                                                         |
| `release-lane.log`  | `node --test scripts/changeset-app-utils.test.mjs scripts/version-gated-products.test.mjs scripts/release-e2e-policy.test.mjs` — 53/53 |
| `ci-workflow.log`   | `node --test scripts/ci-workflow.test.mjs` — pass                                                                                      |
| `build.log`         | `pnpm --filter @codaco/template-registry build` — service and account bundles built                                                    |
| `typecheck.log`     | `pnpm typecheck` — 26/26 tasks                                                                                                         |
| `knip.log`          | `SKIP_ENV_VALIDATION=true ./node_modules/.bin/knip` — pass                                                                             |

The repository lint gate was run as
`./node_modules/.bin/oxlint && ./node_modules/.bin/oxfmt --check .`; it passed
with the repository's existing warning set. `pnpm check:changesets` and
`git diff --check` also pass. Migration byte checks use `git hash-object` for
each Registry migration against `c80e5031b`, `git diff ba1074dd --
apps/studio/server/migrations`, and a direct diff of the four shared migration
engine modules against `ba1074dd`.
