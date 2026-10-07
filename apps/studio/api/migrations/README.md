# Studio migrations

Every deployed Studio database is built and upgraded by `studio-api migrate`
from the numbered directories here, in order, and only from them (#1901). A
database records each migration it applied, with the hash of every file, in
`public.studio_migrations`. That record is what lets the next image know what
the database already has — and it is why a migration cannot change once it has
merged.

Development databases are different: `pnpm --filter @codaco/studio-api
apply-schema` pushes the Drizzle schema directly and never reads this directory.
`migrations-converge.test.ts` proves that the two paths build the same
database.

## Adding a migration

Change the schema (`src/db/schema.ts`, the sidecars, or `src/jobs/schema.ts`),
then:

```sh
pnpm --filter @codaco/studio-api sync-fingerprint
pnpm --filter @codaco/studio-api migrate:generate --name <slug>
```

`<slug>` is lowercase letters, digits and underscores. The generator writes
`NNNN_<slug>/`, numbered after the newest directory, and changes nothing if the
newest migration already matches the schema. Generating twice from the same
tree writes the same bytes, so regenerating a migration and diffing it against
the committed copy is an audit.

Commit the directory as written. Do not reformat it: the formatter is told to
ignore this directory (`.oxfmtrc.json`), and git never converts its line
endings (`.gitattributes`), because every byte is hashed. Any directory here
that is not `NNNN_<slug>` fails the build and the generator, so a mis-named or
half-written migration cannot drop out of the image unnoticed.

The build refuses a schema change that has no migration: `pnpm --filter
@codaco/studio-api build` fails, naming this command, until the newest
migration records the build's fingerprint.

## What a directory holds

Each migration runs these files, in this order, in one transaction with every
other pending migration:

| File           | What it is                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `delta.sql`    | The drizzle-kit DDL from the previous migration's snapshot to this one.                                                                          |
| `sidecars.sql` | The complete sidecars and job schema at this version, not a delta. Every statement is idempotent, so re-running them converges what they create. |
| `backfill.sql` | Optional, hand-written. Data changes the new schema needs (see [Backfills](#backfills)).                                                         |

After each file the runner fires the file's deferred constraint checks, then
checks that the file left the session as it found it (see
[Backfills](#backfills)).

And these, which are not run:

| File            | What it is                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `snapshot.json` | drizzle-kit's snapshot of the schema at this version. The next migration's delta is generated from it.                 |
| `manifest.json` | The version, ordinal, fingerprint, named drops, and the SHA-256 of every file above. The build re-checks every hash.   |
| `NOTES.md`      | Optional advice for operators (for example, an index to build concurrently by hand). Not hashed, and may be edited.    |

Any other file in a numbered directory fails the build.

## Renames and drops

drizzle-kit cannot tell a rename from a drop and an add, so the generator does
not guess. It refuses when, in one change:

- a table (or enum, sequence, view, schema or role) is removed and another
  added, or
- a column is removed from a table and another column added to the same table.

It names both sides. Split the change into two migrations (add, then remove in
a later one), or write the rename yourself (below).

Dropping data needs your name on it. A migration that drops a table or a column
is refused unless each one is named:

```sh
pnpm --filter @codaco/studio-api migrate:generate --name drop_legacy \
  --drop public.legacy_table --drop public.users.nickname
```

The names must match exactly what the migration drops, no more and no fewer.
They are recorded in the manifest. The same check runs when a hand-written
migration is sealed, against the same snapshot diff.

## Making a column NOT NULL

Postgres fills existing rows only when it creates a column: `ADD COLUMN` with
a `DEFAULT` or an identity writes a value into every row, and a new table has
no rows. A column that already exists keeps the values it holds, NULLs
included, whatever default it has or gains: `SET DEFAULT` changes no row. So
a migration needs a backfill whenever a column becomes NOT NULL over rows a
deployed database may already hold:

- a column added to an existing table as NOT NULL with no default or identity;
- an existing nullable column made NOT NULL, with or without a default, and
  also when it becomes an identity column;
- a column or table created where the change also drops a nullable one, since
  a hand-written rename shows as exactly that, and its default fills nothing.

Each passes on the empty database every test builds and fails on any
deployment with a NULL there. The generator refuses it and names the column. A
generated column is exempt: Postgres computes it for every row. Write it by
hand instead:

1. `migrate:generate --name <slug> --hand-written`.
2. In `delta.sql`, add or alter the column **without** NOT NULL.
3. In `backfill.sql`, fill it ([Backfills](#backfills)), then
   `ALTER TABLE … ALTER COLUMN … SET NOT NULL;` as the last statement.
4. `migrate:generate --seal`.

`--seal` refuses such a migration without a `backfill.sql`, and refuses a
`delta.sql` that already sets the column NOT NULL. A new column whose existing
rows can all take one constant needs no backfill: give it a `DEFAULT` in the
schema and the generator writes it.

## Writing a migration by hand

For a rename, a type change with a `USING` clause, or anything that must run
before drizzle-kit's DDL:

```sh
pnpm --filter @codaco/studio-api migrate:generate --name rename_x --hand-written
```

This writes the snapshot and sidecars and an empty `delta.sql`, with no
manifest. Write the statements into `delta.sql` (and `backfill.sql` if you need
one), then seal it:

```sh
pnpm --filter @codaco/studio-api migrate:generate --seal
```

`--seal` writes the manifest. It refuses if the snapshot or sidecars no longer
match the schema, if the delta is empty with nothing before it, if a file
carries a statement that cannot run in the migration's transaction, if
`--drop` does not name exactly the tables and columns the snapshot diff drops,
or if a column becomes NOT NULL without the recipe above. A rename shows in
that diff as a drop of the old name: name it with `--drop`, which records that
you accounted for its data. A generated migration can be edited and re-sealed
the same way, as long as it has not merged; it keeps the drops it was sealed
with unless `--drop` is given again.

The generator refuses to write another migration while the newest one is
unsealed, and the build refuses an unsealed directory.

## Backfills

`backfill.sql` runs last, after the sidecars, so every table it touches —
including one this migration's delta created — already has its policies,
its FORCE ROW LEVEL SECURITY and its grants. It runs as the database owner,
and FORCE binds the owner: an `UPDATE` as the owner matches no rows, silently,
and an `INSERT … SELECT` copies nothing. Switch to the maintenance role, whose
policies see every row, and switch back:

```sql
SET LOCAL ROLE studio_maintenance;
INSERT INTO public.new_table (id, team_id, label)
  SELECT id, team_id, name FROM public.existing_table;
UPDATE public.existing_table SET new_column = old_column;
RESET ROLE;
```

The same recipe fills a new table and an existing one, on every tenant table
except `audit_events` (below). `installation` and `deployment_state` have no
row-level security, so the owner writes them directly.

**Rows a trigger guards.** The backfill also runs under this release's
triggers, as every write does. Some refuse every role, the maintenance role
included: closed studies are read-only (`studies_closed_read_only`), and
finalized sessions and snapshots are immutable. To fill a new column on such
rows, disable that one trigger around the write, as the owner, and enable it
again before the file ends:

```sql
ALTER TABLE studies DISABLE TRIGGER studies_closed_read_only;
SET LOCAL ROLE studio_maintenance;
UPDATE studies SET code = left(id::text, 8);
RESET ROLE;
ALTER TABLE studies ENABLE TRIGGER studies_closed_read_only;
ALTER TABLE studies ALTER COLUMN code SET NOT NULL;
```

The whole upgrade is one transaction, so no other session ever sees the
trigger off. Disable only for a change the trigger was never meant to stop (a
new column's value), never to rewrite what the row records.

**Audit events.** `audit_events` is the one tenant table the maintenance role
cannot write: the sidecars revoke its `UPDATE`, and the table's policy admits
only a session whose `app.team_id` matches the row, with no maintenance
clause. A loop over `teams` would not reach every row either, because an audit
event deliberately outlives its team. Write them as the owner, lifting FORCE
ROW LEVEL SECURITY (so the policy no longer binds the owner) and the
immutability guard around the write, and restore both before the file ends:

```sql
ALTER TABLE audit_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable;
UPDATE audit_events SET new_column = category;
ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ALTER COLUMN new_column SET NOT NULL;
```

Use this route for `audit_events` only. On a table the maintenance role can
write, its triggers and deferred checks read other tables as whoever wrote the
row, and as the owner with no team set they would see nothing and pass. An
audit event records what happened, so fill a new column with what the event
already says; when no such value exists, give the column a default instead.

**Deferred checks.** Two constraint triggers check a row only at the end of
the file (or when told to): a session whose `status` becomes `completed` must
carry its snapshot (`interview_sessions_completion_snapshot`), and a consent
must answer every item of its document
(`participant_consents_required_items_affirmed`). A file whose writes queue
one must fire it, by name, with `SET CONSTRAINTS <name> IMMEDIATE` before
`ENABLE TRIGGER` on that table: Postgres refuses to alter a table with pending
trigger events (55006).

A check reads the role and settings in force when it fires; fired after
`app.team_id` is reset, the consent check would see no team's items and pass a
grant that answers none of them. So the runner fires the checks a file has
queued before every statement that sets the role or a setting — a `SET` or
`RESET` command, or a `SELECT` of `set_config(…)` — under the role and
settings their rows were written under, and a check that fails there is
reported before that statement. Change them only that way: a file whose
statement changes the role, `app.team_id` or `app.erasing_participant_id`
any other way (inside a `DO` body or a function) is refused (**session**).

```sql
ALTER TABLE interview_sessions DISABLE TRIGGER interview_sessions_writable;
SET LOCAL ROLE studio_maintenance;
UPDATE interview_sessions SET status = 'completed', completed_at = now() WHERE …;
INSERT INTO session_snapshots …;
SET CONSTRAINTS interview_sessions_completion_snapshot IMMEDIATE;
RESET ROLE;
ALTER TABLE interview_sessions ENABLE TRIGGER interview_sessions_writable;
```

Never `SET CONSTRAINTS ALL`: it changes the transaction's default, which every
constraint a later migration creates would then follow. The generator,
`--seal`, the build and `migrate` refuse it.

**Data a new constraint needs fixed first.** A delta's CHECK, UNIQUE or NOT
NULL, and a sidecar's index or trigger, apply before the backfill runs. When
existing rows would violate one, fix them in a hand-written `delta.sql`,
before the constraint (the existing table already carries the previous
release's grants, so the same `SET LOCAL ROLE` recipe works there), or add a
CHECK as `NOT VALID` in the delta and `VALIDATE CONSTRAINT` it at the end of
the backfill.

**What the runner does after each file.** First it fires the file's deferred
checks: it sets every deferrable constraint `IMMEDIATE` by name, so a check
runs under the role and settings the file ended on (which, after any change
of them, are the ones its rows were written under: see above), and a backfill that leaves
a row its check refuses fails on that file, by name. The next migration's
sidecars then never meet a table with pending trigger events. It then defers
the `INITIALLY DEFERRED` constraints again, by name, so a later file may still
write a row before the row it points at, and a constraint a later file creates
keeps the mode it was declared with. A deferred constraint whose name another
constraint in its schema shares cannot be told apart from it by `SET
CONSTRAINTS`, so the run is refused (**constraint**): rename one.

Then it refuses, and rolls everything back, when a file:

- ended the transaction (its id moved). Transaction control is refused before
  a run starts (below), so this is a backstop;
- leaves the role switched (a `SET LOCAL ROLE` without `RESET ROLE`);
- leaves a trigger disabled, or firing only in `REPLICA` or `ALWAYS` mode,
  that fired normally before the file;
- is a backfill that changed any trigger at all — created, dropped, or left in
  another mode — or any table's row-level security. A backfill fills data:
  create, drop or change a trigger in `delta.sql`;
- leaves `search_path`, `app.team_id` or `app.erasing_participant_id`
  changed — any setting a file changes lasts for the rest of the upgrade.

`migrations-upgrade.test.ts` applies a generated migration to a database the
demo seed filled, and runs each recipe above against it; add a case there
when a backfill does something new.

## What re-running the sidecars does not do

Each migration re-runs the complete sidecars, so a new or changed function,
trigger, policy or grant is installed. A removed one is not: the sidecars only
create. Write the removal in `delta.sql` (hand-written, then sealed):

- a function, overload or trigger removed from a sidecar: `DROP FUNCTION` /
  `DROP TRIGGER`;
- a grant removed from a sidecar: `REVOKE`;
- a `studio_jobs` table, column, index or CHECK changed: the job schema uses
  `CREATE … IF NOT EXISTS`, which never changes an existing object, so `ALTER`
  or drop and recreate it yourself.

One removal does happen on its own: a sidecar that revokes at table level
(`REVOKE ALL ON t FROM …`) also removes column-level grants on that table, and
then grants back only what it lists.

`migrations-converge.test.ts` builds a database from every migration and one
from a push, and compares their catalogs. It fails when one of these is
missing.

## Statements that cannot run

Every pending migration runs in one transaction the runner opens and commits,
so the generator, `--seal`, the build and `migrate` itself refuse:

- transaction control — `BEGIN`, `START TRANSACTION`, `COMMIT`, `END`,
  `ROLLBACK`, `ABORT`, `SAVEPOINT`, `RELEASE`, `PREPARE TRANSACTION`,
  `COMMIT`/`ROLLBACK PREPARED`, `SET TRANSACTION`, `SET SESSION
  CHARACTERISTICS`. An inner `COMMIT` would commit half an upgrade; an inner
  `ROLLBACK` would record a migration whose statements were undone. Do not
  wrap a backfill in `BEGIN … COMMIT`.
- `CREATE INDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY` and `ALTER TYPE … ADD
  VALUE`, which cannot run in a transaction.
- `SET CONSTRAINTS ALL`, which would change the constraints of every later
  file in the transaction (see [Backfills](#backfills)); name the constraints.

For an index, create it normally in the migration. The instance is closed for
the whole upgrade, so the build's lock blocks nobody; on a large table it
lengthens the maintenance window instead. To keep a long build out of the
window, the migration's statement must tolerate an index that already exists,
which the generator's does not:

1. Write the migration by hand ([above](#writing-a-migration-by-hand)), with
   `CREATE INDEX IF NOT EXISTS <name> ON …` in `delta.sql`, and seal it.
2. In `NOTES.md`, give operators the same statement with `CONCURRENTLY` and
   the same name and definition, to run before the upgrade.
3. Tell them, in the same note, to check it afterwards
   (`SELECT indisvalid FROM pg_index WHERE indexrelid = '<name>'::regclass;`)
   and to `DROP INDEX CONCURRENTLY <name>;` if it is not valid. A concurrent
   build that fails leaves an invalid index behind, which `IF NOT EXISTS`
   would skip just as it skips a valid one.

An instance whose operator built nothing first builds the index inside the
window, as usual. For a new enum value, change the column to `text` with a
CHECK, or create a new type and switch to it.

## Once merged, a migration is frozen

Every database that applied a migration recorded its hashes. An image whose
copy differs is refused by `migrate` as **edited**; one with a different
migration at that position is refused as **reordered**. A CI check
(`scripts/ci/studio-released-migrations.test.mjs`) refuses a branch that
modifies, deletes or renames any file in a directory `origin/main` already
carries, except `NOTES.md`. Fix a merged migration with a new one.

If two branches each add `0002_…`, the second to merge must regenerate: merge
`main` in, delete its own directory, and run `migrate:generate` again, so its
migration is numbered after, and generated from, the one that merged first.

Studio hotfixes carry no migrations: a migration made on a hotfix branch cut
from a release tag could never take its place in `main`'s frozen numbering. A
fix that needs a schema change ships from `main`.

## drizzle-kit is pinned exactly

A delta is drizzle-kit's output, and a snapshot is in drizzle-kit's format.
`pnpm-workspace.yaml` pins it to one exact version, and
`migrations-current.test.ts` fails if the pin becomes a range. Upgrade it
deliberately, then run `migrate:generate` and confirm it reports no change.

## What `migrate` refuses

| Refusal          | Means                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **foreign**      | The database has Studio tables but no migration history (built by `apply-schema`, or by an image before #1901).   |
| **newer**        | A newer image migrated it. Run that image or a newer one, or restore the backup taken before the upgrade.         |
| **reordered**    | A different migration is recorded at one of these positions.                                                     |
| **edited**       | A migration's files differ from what was recorded.                                                                |
| **inconsistent** | The schema stamp was changed outside `migrate`.                                                                   |
| **role**         | A file left the role switched.                                                                                    |
| **session**      | A file left `search_path`, a team or erasure setting, or a trigger not firing behind, or a backfill changed a trigger or row-level security. |
| **transaction**  | A file ended the migration's transaction. Restore the backup taken before the upgrade.                           |
| **constraint**   | A deferred constraint shares its name with another constraint in its schema. Rename one.                          |

A statement Postgres refuses is reported with its migration, file, position
and text, Postgres's SQLSTATE and message, and whether the transaction rolled
back (it always has, unless a file got past the transaction-control refusal).
Postgres's message is shown only for the SQLSTATE classes it words from the
names of schema objects (a constraint, a column, a relation, a lock). Every
other failure is reported by its code alone, because its message can quote
stored values: a data exception (class 22: a failed cast, an out-of-range
value) quotes the value that failed, and a PL/pgSQL `RAISE` (class P0) carries
whatever its trigger interpolated. To see the message, run the statement
against a copy of the database. `Applied …` is printed only once the commit has returned.
A keyring that cannot open what the upgraded database stores is refused before
the commit, so it, too, leaves the database at its previous release.

`apply-schema` refuses a database that carries migration history, naming `migrate`.
