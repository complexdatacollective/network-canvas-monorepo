# Studio database migrations

Studio images include reviewed, versioned database migrations. The image's
`migrate` command applies them explicitly. Starting a server or worker never
applies migrations; a database with an older fingerprint still refuses to boot.
Operators need Docker and their deployment configuration, not a repository
checkout, pnpm, or drizzle-kit.

## Fresh installation and upgrade

Use a dedicated PostgreSQL 18 database. Its `public` schema must initially be
empty, including functions, types, and extension objects. Install optional
database extensions in their own schema. The database login owns Studio's
objects and needs `CREATEROLE` for the first migration. On services that do not
allow that privilege, an administrator must provision the two runtime roles
and grant the login permission to assume them, as described in the README.
The migration refuses existing runtime roles with LOGIN, SUPERUSER, or
BYPASSRLS rather than granting application access to an unsafe identity.

For an existing deployment:

1. Stop the web and worker containers so the old build cannot keep writing
   while its schema changes.
2. Take a database backup with PostgreSQL 18's `pg_dump --format=custom` and
   verify it can be read with `pg_restore --list`. Preserve the matching
   application encryption keys in a separate, encrypted backup. A database
   backup cannot replace the keys needed to read its encrypted fields.
3. Select the new image version in your deployment configuration. Run its
   migration command once, using the same database connection and container
   network as the application. In a Compose deployment whose app service is
   named `studio`:

   ```sh
   docker compose run --rm studio migrate
   ```

   Without Compose, pass your chosen image reference and existing network:

   ```sh
   docker run --rm --network YOUR_DEPLOYMENT_NETWORK \
     --env-file /secure/path/studio.env YOUR_STUDIO_IMAGE migrate
   ```

   The command reads only `DATABASE_URL`; authentication, mail, object storage,
   and client assets are not needed for schema administration. Keep credentials
   in the restricted environment file instead of putting them in shell history.

4. Start the application containers only after migration succeeds. Retain the
   backup and the old image reference until you have verified the upgrade.

The same command provisions a fresh empty database before its first start.
Repeated runs are safe: already applied migrations are verified and left alone.
Concurrent invocations serialize behind the existing Studio advisory lock.
All pending migrations, their sidecars, the migration history, and the new
fingerprint commit in one transaction. SQL failure rolls the transaction back
to the previous schema and data; it does not stamp the failed version.
PostgreSQL executes migration payloads in an atomic procedural context, so
authored transaction-control commands cannot commit or roll back around the
runner's transaction and advisory lock.

The runner rejects missing, reordered, edited, or newer migration history and
a fingerprint inconsistent with that history. Historical artifacts are
checksummed inside the image. This is provenance validation, not a detector
for every manual DDL change: do not alter Studio's live schema outside its
versioned migrations. Application roles cannot write migration history.

## Pre-release databases

Older Studio builds used `drizzle-kit push` and have no versioned history.
This command **refuses to adopt them**, even if their fingerprint happens to
match the image. It also refuses a nonempty database from another application.
There is no automatic baseline-stamping option or destructive fallback.

Keep the original database and original image available. Take and verify a
backup, then export any useful protocol or research data through that build's
supported operations. Provision this image against a separate, empty database.
Import supported exports there and verify their contents before retiring the
old instance. Where the old build has no supported export/import path for a
needed record, retain that database and defer its transition; this initial
migration does not claim an in-place upgrade path for unversioned data. Never
insert a migration-history row by hand to bypass the refusal.

## Recovery

Studio does not run down migrations. Do not point an older image at an upgraded
database: the fingerprint check will refuse it. To recover, restore the backup
into a separate empty database using its matching PostgreSQL major and restart
the previous image with the matching key backup. Verify users, study data and
stored objects before switching traffic. Keep the failed-upgrade database for
diagnosis until recovery has been verified. A PostgreSQL major upgrade is a
separate operator procedure; this command upgrades Studio's application schema.

## Authoring migrations

This section is for repository contributors. Deployment operators do not run
these commands.

After editing Drizzle definitions or SQL sidecars, run:

```sh
pnpm --filter @codaco/studio-server generate:migration --name describe_the_change
```

The command first updates the fingerprint and schema documentation. It diffs
the current assembled Drizzle schema against the preceding immutable snapshot
and creates a numbered directory under `server/migrations/`:

- `snapshot.json`: the Drizzle schema snapshot used to generate the next delta.
- `migration.sql`: the generated delta, with any reviewed data transformations.
- `sidecars.sql`: that version's complete ordered roles, policies, functions,
  triggers, and grants. Broad grants precede every narrower revocation; audit
  immutability remains last.
- `manifest.json`: the previous migration, target source fingerprint and hashes
  binding all three artifacts into the stored migration checksum.

Authoring explicitly treats new and removed names as additions and removals;
it never guesses that they are a rename. The pinned Drizzle Kit rc.4 needs the
small `patches/drizzle-kit@1.0.0-rc.4.patch` API extension for this policy: its
unpatched noninteractive API throws when both sides contain the same kind of
entity. Drizzle still computes the complete diff and SQL. Re-evaluate the
patch when upgrading Drizzle; the authoring regression exercises both an
added and a removed column through the real second-migration command.

Optional `--before path.sql` and `--after path.sql` include reviewed SQL before
or after the generated Drizzle delta, before the sidecars. Use them for data
backfills or removal of obsolete sidecar objects; the generator cannot infer
those transformations from table definitions. All SQL must support execution
inside one transaction and must not contain transaction-control commands.
Data transformations must accompany a schema or sidecar change; a data-only
migration with an unchanged fingerprint would evade the existing boot guard,
so the generator refuses it.
Review destructive DDL and any intentional rename/data preservation before committing. Once an
image publishes an artifact, never edit it: add a subsequent migration.

Run the migration tests against a disposable local database. They exercise
fresh creation, an actual Drizzle-generated upgrade with existing data,
idempotence, two competing command processes, checksum/history refusals,
transaction rollback, and real catalog/privilege assertions. The source guard
test also rejects a build whose newest migration does not match the current
fingerprint and ordered sidecars. Existing domain and tenancy suites still
test each constraint, trigger, and RLS boundary in depth.

Development keeps its separate `db:reset` workflow and destructive synthetic
seeding. It recreates `public` and discards migration history, then applies the
current definitions directly. The test fixtures and protocol demo retain this
developer-only schema helper; production has no `apply-schema` command.
