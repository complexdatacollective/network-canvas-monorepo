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

After each file the runner checks that the file left the session as it found
it, and fires the file's deferred constraint checks (see
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

A column that becomes NOT NULL with no default, on a table the previous
release already has (added that way, or tightened), passes on the empty
database every test builds and fails on any deployment whose table has a row.
The generator refuses it and names the column. Write it by hand instead:

1. `migrate:generate --name <slug> --hand-written`.
2. In `delta.sql`, add the column **without** NOT NULL.
3. In `backfill.sql`, fill it ([Backfills](#backfills)), then
   `ALTER TABLE … ALTER COLUMN … SET NOT NULL;` as the last statement.
4. `migrate:generate --seal`.

`--seal` refuses such a migration without a `backfill.sql`, and refuses a
`delta.sql` that already sets the column NOT NULL. A column whose existing
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

The same recipe fills a new table and an existing one.

**Rows a trigger guards.** The backfill also runs under this release's
triggers, as every write does. Some refuse every role, the maintenance role
included: closed studies are read-only (`studies_closed_read_only`), finalized
sessions and snapshots are immutable, audit events are append-only. To fill a
new column on such rows, disable that one trigger around the write, as the
owner, and enable it again before the file ends:

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

**Data a new constraint needs fixed first.** A delta's CHECK, UNIQUE or NOT
NULL, and a sidecar's index or trigger, apply before the backfill runs. When
existing rows would violate one, fix them in a hand-written `delta.sql`,
before the constraint (the existing table already carries the previous
release's grants, so the same `SET LOCAL ROLE` recipe works there), or add a
CHECK as `NOT VALID` in the delta and `VALIDATE CONSTRAINT` it at the end of
the backfill.

**What the runner checks after each file.** It refuses, and rolls everything
back, when a file:

- leaves the role switched (a `SET LOCAL ROLE` without `RESET ROLE`);
- leaves `search_path`, `app.team_id` or `app.erasing_participant_id`
  changed — any setting a file changes lasts for the rest of the upgrade;
- leaves a trigger disabled;
- ended the transaction (its id moved). Transaction control is refused before
  a run starts (below), so this is a backstop.

Then it fires the file's deferred constraint checks (`SET CONSTRAINTS ALL
IMMEDIATE`), so a backfill that leaves a row its deferred check refuses fails
on that file, by name, and the next migration's sidecars never meet a table
with pending trigger events (Postgres refuses an `ALTER TABLE` on one). It then
defers the `INITIALLY DEFERRED` constraints again, so a file may still write a
row before the row it points at.

`migrations-upgrade.test.ts` applies a generated migration to a database the
demo seed filled; add a case there when a backfill does something new.

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

For an index, create it normally in the migration; if a table is large enough
that the lock matters, say so in `NOTES.md` for operators to build it
concurrently first. For a new
enum value, change the column to `text` with a CHECK, or create a new type and
switch to it.

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
| **session**      | A file left `search_path`, a team or erasure setting, or a disabled trigger behind.                               |
| **transaction**  | A file ended the migration's transaction. Restore the backup taken before the upgrade.                           |

A statement Postgres refuses is reported with its migration, file, position
and text, Postgres's SQLSTATE and message, and whether the transaction rolled
back (it always has, unless a file got past the transaction-control refusal).
A keyring that cannot open what the upgraded database stores is refused before
the commit, so it, too, leaves the database at its previous release.

`apply-schema` refuses a database that carries migration history, naming `migrate`.
