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
newest migration already matches the schema.

Commit the directory as written. Do not reformat it: the formatter is told to
ignore this directory (`.oxfmtrc.json`), because every byte is hashed.

The build refuses a schema change that has no migration: `pnpm --filter
@codaco/studio-api build` fails, naming this command, until the newest
migration records the build's fingerprint.

## What a directory holds

Each migration runs these files, in this order, in one transaction with every
other pending migration:

| File           | What it is                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `delta.sql`    | The drizzle-kit DDL from the previous migration's snapshot to this one.                                                                          |
| `backfill.sql` | Optional, hand-written. Data changes that the delta's DDL needs (see [Backfills](#backfills)).                                                   |
| `sidecars.sql` | The complete sidecars and job schema at this version, not a delta. Every statement is idempotent, so re-running them converges what they create. |

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
They are recorded in the manifest.

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
match the schema, if the delta is empty with nothing before it, or if a file
carries a statement that cannot run in a transaction. A generated migration
can be edited and re-sealed the same way, as long as it has not merged; it
keeps the drops it was generated with. `--seal --drop <name>` records the drops
a hand-written delta makes. The generator cannot check a delta you wrote, so
name every table and column it drops.

The generator refuses to write another migration while the newest one is
unsealed, and the build refuses an unsealed directory.

## Backfills

`backfill.sql` runs as the database owner, but the tables have FORCE ROW LEVEL
SECURITY: as the owner, an `UPDATE` matches no rows, silently. Switch to the
maintenance role, whose policies see every row, and switch back:

```sql
SET LOCAL ROLE studio_maintenance;
UPDATE public.example SET new_column = old_column;
RESET ROLE;
```

The runner refuses a migration that leaves the role switched after any file,
and rolls everything back.

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

Every pending migration runs in one transaction, so `CREATE INDEX
CONCURRENTLY`, `DROP INDEX CONCURRENTLY` and `ALTER TYPE … ADD VALUE` are
refused by the generator, by `--seal` and by the build. Create the index
normally in the migration; if a table is large enough that the lock matters,
say so in `NOTES.md` for operators to build it concurrently first. For a new
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
| **role**         | A backfill left the role switched.                                                                                |

`apply-schema` refuses a database that carries migration history, naming `migrate`.
