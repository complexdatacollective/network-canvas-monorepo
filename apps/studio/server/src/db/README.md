# Studio's schema and its sidecars

Studio's database is defined in three parts. Drizzle defines the tables,
columns, indexes, CHECK constraints, foreign keys and row-level security
policies. Everything else Postgres needs — the roles the application runs as,
`FORCE ROW LEVEL SECURITY`, the `GRANT`/`REVOKE` pairs, and the plpgsql trigger
functions that enforce transitions — is written as raw SQL in **sidecars**. The
third part is the background queue's own schema, `studio_jobs`: two tables,
their indexes, a notify trigger and their grants, installed by
`scripts/apply.ts` from `src/jobs/schema.ts`, with the queue
declarations beside them in `@codaco/studio-sync/jobs` (#1895, #1927).

All three are hashed into one fingerprint and applied together. A sidecar is
not a migration, an afterthought, or an escape hatch: it is the part of the
schema that Drizzle has no vocabulary for, and it carries most of the rules
that make a row safe to trust.

## What is in this folder

| File                          | What it is                                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`                   | Assembles `SCHEMA` (every Drizzle table) and `SIDECARS` (every raw-SQL block, **in order**), and holds the boot-time verdict: `checkSchema`, `stampFingerprint`, `schemaProblemMessage`, and their Effect twins `checkSchemaEffect`, `stampFingerprintEffect`.                                     |
| `access.ts`                   | The one sidecar that lives here rather than beside a domain — the broad table grant, because it belongs to no single domain.                                                                                                                                                                       |
| `auth-schema.ts`              | better-auth's tables: its core five (`user`, `session`, `account`, `verification`, `rateLimit`) plus the organization plugin's `teams`, `team_members` and `team_invitations`, renamed to domain vocabulary. `rls.test.ts` treats this whole set as the tables that sit outside the tenant policy. |
| `deployment-state.ts`         | The one-row `deployment_state` table and its grants: whether the deployment is in a maintenance window. No team, so no policy; the singleton check and the grants keep it honest.                                                                                                                  |
| `fingerprint.generated.ts`    | Generated. Do not edit; run `sync-fingerprint`.                                                                                                                                                                                                                                                    |
| `client.ts`                   | The three Effect clients — `Database`, `MaintenanceDatabase`, `OwnerDatabase` — each a `PgClient` with the drizzle builder over it. See [The clients](#the-clients-and-how-a-transaction-is-opened).                                                                                               |
| `tenant.ts`                   | The only ways a transaction is opened: `TenantScope`, `UntenantedScope`, `MaintenanceScope`, `OwnerScope`, and `savepoint` for a nested one. Re-exports `Transaction` and `TeamAccess` from `@codaco/studio-sync/tenant`.                                                                          |
| `errors.ts`                   | One reading of a database failure: `sqlState`, `isLockUnavailable`, `uniqueViolationConstraint`, `isMissingRole`, and `sqlErrorsOnly`, which every builder span applies.                                                                                                                           |
| `statements.ts`               | `splitStatements`: a Postgres script cut into single commands, dollar-quote-, string- and comment-aware.                                                                                                                                                                                           |
| `migrate.ts`                  | What `studio-api migrate` runs in the image.                                                                                                                                                                                                                                                       |
| `pool.ts`, `database-pool.ts` | The node-postgres pools that remain, and their scoped service: better-auth's adapter (stage 6 moves it), the scripts, and the surfaces not yet on Effect.                                                                                                                                          |
| `__tests__/`                  | The clients, scopes and errors; `rls.test.ts` (the team boundary across the whole schema); `migrate.test.ts`; `statements.test.ts`; `seed.test.ts`; and `raw-sql-policy.test.ts`.                                                                                                                  |

The development seed is not here: it is `scripts/seed/`, beside the other
scripts that write a database wholesale.

Domain tables and their sidecars do **not** live here. Each domain owns its
own: `src/study/schema.ts`, `src/audit/schema.ts`, `src/consent/schema.ts` and
so on each export a `*_TABLES` map and a `*_SIDECAR_SQL` string. This folder
only assembles them, and `@codaco/studio-sync` contributes the sync tables plus
the role bootstrap.

## Why sidecars are needed

Drizzle's schema builder covers the shape of the data. It does not cover:

- **Roles.** `studio_app` and `studio_maintenance` are created by SQL
  (`TENANT_ROLES_SQL` in `@codaco/studio-sync/rls`), idempotently and under an
  advisory lock so parallel provisioning cannot race on `CREATE ROLE`.
- **`FORCE ROW LEVEL SECURITY`.** This is the subtle one. Drizzle can declare
  the `team_isolation` policy, but a policy is decorative for the table's owner
  unless the table is FORCEd, and it is bypassed outright by a superuser. So
  the sidecar FORCEs every tenant table, and the application never runs as
  the owning login: every transaction the application client opens runs as
  `studio_app`, a `NOLOGIN NOSUPERUSER NOBYPASSRLS` role (see
  [The clients](#the-clients-and-how-a-transaction-is-opened) for how that is
  pinned). Maintenance is expressed as a clause
  inside the policy rather than as a `BYPASSRLS` role, because only a superuser
  can create one of those and managed Postgres does not grant that.
- **Privileges.** `GRANT` and `REVOKE`, including column-level grants such as
  `GRANT UPDATE (handle_consumed_at) ON audit_export_jobs`.
- **Transitions.** A CHECK constraint sees one row. Most of Studio's real rules
  are about a _change_: a closed study is read-only, a published consent
  document's items are frozen, a session's completion snapshot is written once,
  an audit event can never be updated or deleted. Those need `OLD` and `NEW`,
  which means a trigger.

The trigger layer is the bulk of it — around eighty triggers over sixty-odd
plpgsql functions, spread across seventeen sidecar modules. The current
inventory is generated, not listed here: see the schema section of
[`apps/studio/README.md`](../../../README.md) and `schema-erd.svg`.

## The shape of a sidecar

The smallest complete example is the sync sidecar:

```sql
CREATE OR REPLACE FUNCTION sections_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'section documents are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sections_immutable
  BEFORE UPDATE ON sections
  FOR EACH ROW
  WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id
        OR NEW.hash IS DISTINCT FROM OLD.hash
        OR NEW.doc IS DISTINCT FROM OLD.doc)
  EXECUTE FUNCTION sections_are_immutable();
```

followed by the role bootstrap and, for the tables it owns, `FORCE ROW LEVEL
SECURITY` plus the tenant DML grants.

Two conventions worth copying:

- **Statements are unqualified.** No `public.` prefix anywhere — tables,
  functions, and the triggers that bind to them. That is what lets the test
  suites provision the whole schema into a throwaway named schema by setting
  `search_path`, rather than needing a database each.
- **Deny by default where the rule is about a row's contents.**
  `studies_closed_is_read_only` subtracts an allowlist of five columns from
  both `to_jsonb(OLD)` and `to_jsonb(NEW)` and compares what is left, rather
  than naming the columns it forbids. A column added to `studies` after the trigger
  was written therefore fails closed instead of silently becoming writable on a
  closed study.

## Order is part of the definition

`SIDECARS` is an array, and its order is load-bearing:

1. **sync** creates the roles and grants schema usage and sequence access.
2. **access** grants `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` to both
   roles.
3. **domain sidecars** install their triggers, their tenant grants, and — where
   a table is an outbox or a history — their narrower revocations.
4. **audit** stays last, because its revocations are the strictest.

The reason is that the broad grant in step 2 re-admits whatever an earlier
`REVOKE` took away. A revocation placed before it is silently undone, which is
a security control that reads as present and is not — the webhook slice found
exactly that. So the broad grant goes first, and nothing after it grants more
than its own tables.

The same ordering logic applies within a single sidecar. Audit revokes
`UPDATE, DELETE ON audit_export_jobs` and then grants back
`UPDATE (handle_consumed_at)`. Reversed, the column grant would be swallowed by
the table-level revoke.

Both properties are pinned by tests rather than by comment alone — see below.

## How they are applied

`scripts/apply.ts` is the only thing that writes schema; the server itself only
verifies.

- `renderSchemaStatements()` = the Drizzle DDL that `drizzle-kit` generates,
  followed by `SIDECARS`.
- `renderJobStatements()` = the job queue's DDL and grants for the
  `studio_jobs` schema (`src/jobs/schema.ts`). They are rendered
  separately from the public statements because that list is the DDL the
  suites execute into a scratch schema by setting `search_path`, and these
  statements name a schema of their own instead.
- `computeSchemaFingerprint()` is a SHA-256 over both lists joined.
  **Sidecars are inside the hash, and whitespace counts** — editing a sidecar
  changes the fingerprint, which is why every sidecar change needs
  `pnpm --filter @codaco/studio-server sync-fingerprint`. So is the job
  schema: a column on `studio_jobs.jobs`, an index, the notify trigger or a
  job grant moves the fingerprint too, and every process refuses the database
  until `apply-schema` has been run against it.
- `applySchema()` takes an advisory lock, clears the stamp (so a failure
  part-way cannot leave a drifted database reading as current), runs
  `drizzle-kit push`, executes the sidecars, installs the `studio_jobs` schema,
  and stamps the fingerprint. The job DDL is idempotent (`IF NOT EXISTS`,
  `OR REPLACE`), so reapplying it leaves the queued jobs where they are; a
  database whose job schema is a different shape from this build's is refused
  by the fingerprint, not reconciled — the same pre-release posture the public
  schema takes.
- `migrateDatabaseEffect()` (`src/db/migrate.ts`) is what `studio-api migrate`
  runs in the image, where drizzle-kit does not exist, on one `OwnerDatabase`
  client that the command then reuses for the bootstrap token. The build
  renders the same statements into `dist/schema-ddl.json`
  (`scripts/render-schema-ddl.ts`) and this executes them in one transaction,
  then installs `studio_jobs` through `installJobSchemaEffect` — the Effect
  half of `src/jobs/install.ts`, over the statement list `applySchema`'s
  node-postgres `installJobSchema` sends — and stamps the fingerprint with
  `stampFingerprintEffect`. It holds a session advisory lock on a reserved
  connection across `checkSchemaEffect` and that transaction, releasing it in
  the scope's finalizer, so two migrates serialise. It runs on
  `@effect/sql-pg`, which has **no simple-query path**: every statement goes
  through Parse/Bind/Execute, and a multi-command string is refused (SQLSTATE
  42601). So every script — the rendered DDL, each sidecar, the job schema and
  its grants — is cut by `splitStatements` (`statements.ts`) and sent one
  command at a time, inside the one transaction. A `;` split would not do:
  several sidecars carry dollar-quoted plpgsql bodies. The fingerprint is
  computed over the _unsplit_ strings, so splitting does not move it. It refuses a
  document whose statements do not hash to the fingerprint beside them, and —
  pre-release — it refuses a database another build created rather than
  reconciling it (#1901).

### The `studio_jobs` schema

The job queue (#1927) installs two tables of its own, outside `public`:
`applySchema` pushes `public` with drizzle-kit, which reconciles everything it
introspects there against what Drizzle declares, and would drop an undeclared
jobs table on the next push. The DDL and grants live in
`src/jobs/schema.ts`, the install in `src/jobs/install.ts` (a
node-postgres function for `scripts/apply.ts`, whose drizzle-kit push needs a
node-postgres client and so keeps the whole checkout apply on it, and an Effect
version over an open `Transaction` for `studio-api migrate` and the test
harness, both over one statement list),
and the schema name in `src/jobs/queues.ts`.

It is fingerprinted like everything else, because the fingerprint is the only
thing that would notice its shape changing: a worker that claimed a job from a
table missing a column this build expects would fail at the claim rather than
at boot.

- At boot, `checkSchema()` returns `current`, `absent`, or `stale` (either
  `mismatch` or `unstamped`). A database carrying the tables with no
  fingerprint is refused rather than adopted: the SQL that built it is unknown.

Test suites take a different path. `TestDatabaseLive`
(`src/__tests__/support/database.ts`) runs the composed statements into a
scratch schema instead of pushing, because `drizzle-kit push` introspects
`public` and cannot target a named schema — split by `splitStatements`, in one
transaction, from a cache addressed by the fingerprint.

## The clients, and how a transaction is opened

The server reaches Postgres through three `@effect/sql-pg` clients
(`client.ts`), one per identity, each carrying the statement client (`sql`) and
the drizzle builder over it (`db`):

| Client                | Runs as                               | Used by                                                   |
| --------------------- | ------------------------------------- | --------------------------------------------------------- |
| `Database`            | `studio_app`, under the tenant policy | the web process's commands and reads                      |
| `MaintenanceDatabase` | `studio_maintenance`                  | the worker: the queue, the sweeps, the summary job        |
| `OwnerDatabase`       | the connecting login                  | `migrate`, the seed, and the suites' fixtures and oracles |

**One client value per identity per program.** `SqlClient` routes a statement
to the fiber's open transaction by a key that belongs to the client _instance_,
so a second client built for the same database would silently run on its own
connection inside another client's transaction — which is how an enqueue could
escape the transaction it was meant to commit with. `__tests__/tenant.test.ts`
pins it.

A transaction is opened only through the scopes in `tenant.ts`, and never on a
bare client:

- `TenantScope.open(access, body)` — the application client, the team GUC
  stamped. It takes a `TeamAccess`, never a bare team id, and a `TeamAccess`
  can only come from one of the named constructors that check membership, so
  a tenant transaction cannot be opened without that check having happened.
- `UntenantedScope.open(body)` — the application client with no team stamped,
  for the few reads that precede one (an invitation's team, the installation
  row). Every tenant policy fails closed without the GUC.
- `MaintenanceScope.open(body)` / `.openTenant(access, body)` — the worker's.
- `OwnerScope.open(body)` — the connecting login's.
- `savepoint(body)` — a nested transaction on the one already open. `SqlClient`
  emits no `RELEASE` on success, so a bulk loop must not open one per row.

Each provides `Transaction` (`{ tx, sql, teamId }`) to its body, and the data
layer requires that service rather than a client — so a store function cannot
run outside a transaction, and runs on its caller's.

**The role is pinned per transaction, for now.** `@effect/sql-pg`
4.0.0-rc.115 has no `startupParameters`, so each scope's first statements are
`set local role` and — where a client was built with one, as the suites' are —
`set local search_path` (`pinSession` in `tenant.ts`). That is weaker than a
startup parameter in one place: a statement run on a client outside any scope
runs as the connecting login. When rc.116 lands the two statements become
startup parameters and nothing else changes.

**Raw rows decode differently from built ones on rc.115.** The builder parses
dates itself, so its rows carry `Date`s. A raw statement's rows do not: a
`timestamptz` arrives as epoch milliseconds, a `date` as a string, and `int8`
or an uncast `count(*)` as a `bigint`. Every raw read converts at the seam.

**The builder is the default.** A statement goes to the driver as text for a
stated reason — a `WITH RECURSIVE`, a statement with no FROM clause, an
`INSERT … SELECT` over a correlated lateral subquery, anything against the job
schema, which drizzle does not model — and each one is named in
`__tests__/raw-sql-policy.test.ts` with its reason. Two groups on that list are
there for history rather than necessity: the queue handlers #1957 ported from
their pg-boss originals text for text, and the node-postgres residue (the
scripts' schema helpers, the readiness probe, `createTenantDb`) that stage 6
retires.
Two rules for the builder: **every write whose outcome is inspected ends in
`.returning()`** (without it the driver's result object comes back typed as a
row array, and `result[0]` is `undefined`), and **every builder span applies
`sqlErrorsOnly`**, because drizzle's own error interpolates the query and every
bound parameter into its message.

## How the sidecars are tested

Five layers, each answering a different question. Skipping any one of them
leaves a failure mode that looks like success.

### 1. Does the rule actually fire?

`src/<domain>/__tests__/schema.test.ts`, beside each domain. These are the real
oracle: a scratch schema on a real Postgres, the transition driven for real, and
an assertion on **the rejection Postgres raises** — the constraint name for a
CHECK, unique or foreign-key violation, the message for a trigger. Asserting
the specific error rather than "it threw" is deliberate, so a guard that stopped
firing cannot pass as "no error" from some unrelated failure.

`src/study/__tests__/schema.test.ts` and `src/schedule/__tests__/schema.test.ts`
are the two biggest, and either is a good model to copy.

### 2. Does the team boundary hold?

`src/db/__tests__/rls.test.ts` — which tables carry the policy, that the
application role cannot see past it, and that the better-auth tables stay
reachable without team context.

### 3. Are the composed invariants intact?

`src/__tests__/schema.test.ts`, which tests the assembly rather than any one
rule:

- The committed fingerprint matches the schema definitions.
- **Position:** the broad access grant runs before every narrow revocation, and
  the audit immutability sidecar is last.
- **Effect:** on a freshly provisioned schema, every `REVOKE` parsed out of the
  composed SQL is re-checked with `has_table_privilege`. Position and effect are
  separate assertions on purpose — correct ordering is not proof that the
  privilege actually ended up revoked.
- The apply paths themselves, against throwaway databases: a fresh provision, a
  no-op re-apply, a drifted database reconciled in place, and two concurrent
  applies serialising.

### 4. Is every raw statement accounted for?

`src/db/__tests__/raw-sql-policy.test.ts` tokenizes the server's source and
`@codaco/studio-sync`'s, collects every statement handed to a driver as text
(`sql.unsafe`, the client's `` sql`…` `` template, `sql.raw`, `.execute` and a
connection's `executeRaw` family — and node-postgres's `.query`, so the `pg`
residue is pinned until stage 6 retires it), and charges each to the `Effect.fn` span that encloses it, or to its file. The
result must equal the allowlist exactly: a new raw statement fails until it is
listed with its reason, and a listed one that is gone fails until it is
removed.

### 5. Do the docs still describe the database?

An entity-relationship diagram can only draw tables and foreign keys, so
everything in this document's subject — RLS, privileges, triggers — is invisible
to it. `scripts/schema-docs.ts` compensates: it scrapes the composed sidecar SQL
with regexes and re-attaches what it finds, as DBML notes that the renderer turns
into SVG tooltips, and as a markdown table in the schema section of
`apps/studio/README.md`.

That scraping is where a silent failure lives. A trigger written in a shape the
regex does not match simply vanishes from the docs. Nothing else notices: the
schema still applies, the fingerprint still changes and gets resynced, the
diagram still renders. What you are left with is documentation describing the
database as less strict than it is. The inverse matters too, which is why there
is an explicit matcher for `Grants UPDATE (handle_consumed_at) to studio_app` —
without it the README would document the revocation and not the re-admission,
and so read as stricter than reality.

The guard has two halves, in two places, because they cost different amounts:

- **`pnpm --filter @codaco/studio-server check:schema-docs`** re-renders the
  docs and fails if either committed artifact has drifted. This is the complete
  check — it is the only thing that catches a change to the renderer or to the
  splice. It runs as its own CI step in `quality-support`, not as a test,
  because it is seconds of CPU with no database in it and has no business
  competing for a per-test budget with the suites above that hold Postgres busy
  for minutes.
- **Two cases in `src/__tests__/schema.test.ts`** read the artifacts as
  committed, which costs nothing. One holds the README section to the current
  `SCHEMA_FINGERPRINT`, which catches the ordinary staleness — a schema or
  sidecar change resynced nowhere. The other asserts that each named role,
  forced table, privilege line and trigger still appears in both the README
  section and the SVG.

One honest limit on that second case: its list of names is hand-maintained. It
catches an existing documented rule disappearing, but adding a new trigger does
not automatically add a matcher for it. Add one when you add a sidecar rule.

## Adding or changing a sidecar

1. Put the SQL beside its domain (`src/<domain>/schema.ts`), exported as
   `<DOMAIN>_SIDECAR_SQL`, and add it to `SIDECARS` in `schema.ts` **at the
   right position** — after `ACCESS_SIDECAR_SQL` if it revokes anything, and
   before the audit sidecar.
2. Keep every statement unqualified so it can be provisioned into a scratch
   schema.
3. Write the behaviour test beside the domain, asserting the exact rejection.
4. Run `pnpm --filter @codaco/studio-server sync-fingerprint`, which updates
   `fingerprint.generated.ts`, `apps/studio/schema-erd.svg`, and the README
   section. Commit all three.
5. Add a matcher for the new rule to the sidecar-documentation case in
   `src/__tests__/schema.test.ts`.
6. Run `pnpm --filter @codaco/studio-server check:schema-docs` and the test
   suite. The suites need a reachable local Postgres; without one the
   database-backed cases skip rather than fail.
