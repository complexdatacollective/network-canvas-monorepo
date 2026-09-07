# Studio database migrations

Studio images include reviewed, versioned database migrations. The image's
`migrate` command applies them explicitly. Starting a server or worker never
applies migrations; a database with an older fingerprint still refuses to boot.
Operators need Docker and their deployment configuration, not a repository
checkout, pnpm, or drizzle-kit.

## Fresh installation and upgrade

Use a dedicated PostgreSQL 18 database and deployment-specific login credentials.
Its `public` schema must initially be empty, including functions, types, and
extension objects. Install optional database extensions in their own schema.
The migration login normally owns the database and Studio's objects. A separate
enrolled database owner is also supported when it grants the operator the
ownership privileges needed to administer the schema. These are administrative
identities; use separate, unprivileged runtime and backup logins. The migration
operator and runtime login need permission to assume the existing `studio_app`
and `studio_maintenance` roles. The backup login may assume only `studio_backup`. An administrator can
pre-create these roles; `CREATEROLE` is needed only when the migration operator
creates them. On a shared cluster, have the administrator provision the roles
and memberships for each deployment before migrating.

Runtime roles must be NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE,
NOCREATEDB, and NOREPLICATION, with no parent-role memberships. The migration
checks these properties even for pre-created roles and on repeated runs.
Concurrent role creation in different databases handles the duplicate-name
race and validates the winning role. Database advisory locks alone cannot
serialize cluster-wide role creation.

### Provision database access before migration

PostgreSQL checks CONNECT when a connection opens. Revoking it later does not
remove existing sessions. The database administrator must therefore commit the
connection enrollment **before admitting connections**, independently of the
schema migration. Studio checks that enrollment; it does not silently change
it or terminate sessions.

For example, after provisioning dedicated login roles and their credentials,
run this from an administrator connection to a different database. These role
and database names are examples; use your deployment's actual identifiers.
Runtime and backup logins must be NOINHERIT, lack database administration and
replication attributes, and not be shared with another Studio deployment.

```sql
CREATE ROLE studio_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
CREATE ROLE studio_maintenance NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
GRANT studio_app, studio_maintenance TO studio_migrator, studio_runtime
  WITH SET TRUE, INHERIT FALSE;
CREATE DATABASE studio OWNER studio_migrator ALLOW_CONNECTIONS false;
BEGIN;
REVOKE CONNECT ON DATABASE studio FROM PUBLIC, studio_app, studio_maintenance;
REVOKE TEMPORARY ON DATABASE studio FROM PUBLIC, studio_app, studio_maintenance, studio_runtime;
GRANT CONNECT ON DATABASE studio TO studio_migrator, studio_runtime;
COMMIT;
ALTER DATABASE studio ALLOW_CONNECTIONS true;
```

Do not recreate runtime roles already present on the cluster; validate their
attributes and memberships instead. Every enrolled identity must be a LOGIN
role. Enroll the database owner, migration operator, runtime login, and any
separately provisioned backup login by granting each CONNECT directly and
listing exactly those names in the migration environment:

```dotenv
STUDIO_DATABASE_ALLOWED_LOGINS=["studio_migrator","studio_runtime"]
```

Runtime logins must hold both SET TRUE, INHERIT FALSE, ADMIN FALSE memberships
in `studio_app` and `studio_maintenance`; missing either role is refused before
any schema work. A separately provisioned backup login
may instead hold only that membership in `studio_backup`; backup and runtime
memberships cannot be combined. The backup role is validated when present;
its provisioning and SELECT policies belong to the backup schema migration.
Unknown roles, built-in roles, other enrolled logins, and owner-role membership
are refused for runtime and backup credentials, even when a membership's SET
and INHERIT options are disabled. Administrative owner/operator membership is
permitted separately.

Runtime and backup logins must hold no direct or PUBLIC data privileges in
application schemas, including table/column, view, materialized-view, foreign-table,
and sequence grants. Access belongs to their reviewed NOLOGIN roles. Both the
logins and those roles must own no database objects, have no database/schema
CREATE, database TEMPORARY, or CONNECT grant options, and be unable to execute
user-defined SECURITY DEFINER routines. This prevents SET ROLE NONE, object
ownership, or a view/function from bypassing the intended privileges.

Ordinary TEMPORARY permission implicitly grants CREATE in the connection's
current temporary namespace, even without a namespace ACL. Revoke it from PUBLIC
and every restricted role/login, including any provisioned backup identity,
before initial migration and after restoring a database. Direct grants survive
PUBLIC revocation. The migrator checks this capability even before a temporary
namespace exists; it does not repair database ACLs. The separately enrolled
administrator/owner may retain TEMPORARY for migration and restore work.

PostgreSQL 18's reviewed stock PUBLIC catalog reads and ordinary functions remain
available. Before trusting any migration evidence, and again after sidecars,
Studio refuses additional effective catalog function/table/column capabilities,
including system columns such as `ctid`; reserved namespace ownership, CREATE,
and USAGE grant options; and unreviewed SECURITY DEFINER routines in `pg_*` or
`information_schema`. Unknown or extension-provided grants are not treated as
stock permissions. Stock `pg_settings` UPDATE remains the session SET interface
and obeys the forbidden-parameter checks below. Correct unexpected grants
explicitly before migrating; the migration does not silently enroll those extra
capabilities. Catalog definition integrity remains an administrator responsibility.

Large-object creation is an additional administrator provisioning step in
**each dedicated database**. PostgreSQL normally grants PUBLIC permission to
create these persistent objects even without table write privileges. Before
migration, while application services remain stopped, connect to the Studio
database as the built-in function owner or provider administrator and run:

```sql
REVOKE EXECUTE ON FUNCTION
  pg_catalog.lo_create(oid), pg_catalog.lo_creat(integer),
  pg_catalog.lo_from_bytea(oid, bytea), pg_catalog.lo_import(text),
  pg_catalog.lo_import(text, oid), pg_catalog.lo_export(oid, text)
FROM PUBLIC, studio_app, studio_maintenance, studio_runtime;
```

Installer authors use `revokeLargeObjectPrivilegesSql` from
`@codaco/studio-sync/role-bootstrap`, passing the existing restricted roles and
logins. The migration verifier uses the same reviewed function inventory.
The helper grants no administrator privileges and still requires an
administrator connection to each target database.

Include any pre-provisioned backup role and login in that revocation. Remove
unexpected direct grants too; revoking PUBLIC does not remove a role-specific
EXECUTE grant. If an administrator-owned restore needs to create large objects,
grant only its separate restore identity EXECUTE on the required creation
functions. A database owner without ownership of these built-in functions
cannot revoke their grants; have the provider administrator complete this step.
The migration checks effective privileges and refuses unsafe access even when
no large objects exist. It never grants a backup identity persistent writes.

Neither runtime nor backup identities may have SET permission on
`lo_compat_privileges` or `session_replication_role`. Clear unsafe database,
role, and role-in-database defaults as well: revoking SET does not remove
stored defaults that new connections apply. Migration requires its own
connection to use `lo_compat_privileges=off` and
`session_replication_role=origin`, and refuses every applicable unsafe stored
default, including one currently shadowed by an override. PostgreSQL documents
these [stored defaults](https://www.postgresql.org/docs/18/catalog-pg-db-role-setting.html)
and the [large-object functions](https://www.postgresql.org/docs/18/lo-funcs.html).

Runtime roles may not hold TRUNCATE, REFERENCES (including column grants),
TRIGGER, or MAINTAIN on ordinary or partitioned application tables. In
particular, TRUNCATE bypasses row-level security. Runtime sequence grants may
include USAGE and SELECT but never UPDATE: setval can rewind or exhaust a
sequence independently of table access. Studio supports invoker
triggers, but refuses SECURITY DEFINER triggers and non-SELECT rewrite rules,
including disabled definitions: [rewrite actions use the relation owner's
privileges](https://www.postgresql.org/docs/18/rules-privileges.html) and can forge
migration evidence without giving the runtime a direct grant on that evidence.
A database with those definitions needs its provenance investigated and a
verified restore, rather than deletion of history or hand-stamping a version.

Large-object creation is an additional administrator provisioning step in
**each dedicated database**. PostgreSQL normally grants PUBLIC permission to
create these persistent objects even without table write privileges. Before
migration, while application services remain stopped, connect to the Studio
database as the built-in function owner or provider administrator and run:

```sql
REVOKE EXECUTE ON FUNCTION
  pg_catalog.lo_create(oid), pg_catalog.lo_creat(integer),
  pg_catalog.lo_from_bytea(oid, bytea), pg_catalog.lo_import(text),
  pg_catalog.lo_import(text, oid), pg_catalog.lo_export(oid, text)
FROM PUBLIC, studio_app, studio_maintenance, studio_runtime;
```

Installer authors use `revokeLargeObjectPrivilegesSql` from
`@codaco/studio-sync/role-bootstrap`, passing the existing restricted roles and
logins. The migration verifier uses the same reviewed function inventory.
The helper grants no administrator privileges and still requires an
administrator connection to each target database.

Include any pre-provisioned backup role and login in that revocation. Remove
unexpected direct grants too; revoking PUBLIC does not remove a role-specific
EXECUTE grant. If an administrator-owned restore needs to create large objects,
grant only its separate restore identity EXECUTE on the required creation
functions. A database owner without ownership of these built-in functions
cannot revoke their grants; have the provider administrator complete this step.
The migration checks effective privileges and refuses unsafe access even when
no large objects exist. It never grants a backup identity persistent writes.

Neither runtime nor backup identities may have SET permission on
`lo_compat_privileges` or `session_replication_role`. Clear unsafe database,
role, and role-in-database defaults as well: revoking SET does not remove
stored defaults that new connections apply. Migration requires its own
connection to use `lo_compat_privileges=off` and
`session_replication_role=origin`, and refuses every applicable unsafe stored
default, including one currently shadowed by an override. PostgreSQL documents
these [stored defaults](https://www.postgresql.org/docs/18/catalog-pg-db-role-setting.html)
and the [large-object functions](https://www.postgresql.org/docs/18/lo-funcs.html).

Runtime roles may not hold TRUNCATE, REFERENCES (including column grants),
TRIGGER, or MAINTAIN on ordinary or partitioned application tables. In
particular, TRUNCATE bypasses row-level security. Runtime sequence grants may
include USAGE and SELECT but never UPDATE: setval can rewind or exhaust a
sequence independently of table access. Studio supports invoker
triggers, but refuses SECURITY DEFINER triggers and non-SELECT rewrite rules,
including disabled definitions: [rewrite actions use the relation owner's
privileges](https://www.postgresql.org/docs/18/rules-privileges.html) and can forge
migration evidence without giving the runtime a direct grant on that evidence.
A database with those definitions needs its provenance investigated and a
verified restore, rather than deletion of history or hand-stamping a version.

Enrolled logins must not have memberships granted to an unenrolled role:
SET-only membership can impersonate an owner even without inherited privileges.
Studio refuses PUBLIC or shared-role CONNECT, unexpected direct or inherited
CONNECT, missing explicit CONNECT, unsafe runtime or backup login attributes, and
existing sessions from unenrolled non-superuser logins. Cluster superusers are
trusted administrators and bypass database ACLs; never use their credentials
for a deployed runtime.

When schema work is pending, migration also refuses every existing runtime or
backup session, even if its login is enrolled or has switched to a permitted
role. It checks before pending SQL and refreshes the check immediately before
commit, rolling back if a runtime reconnects during the transaction. A no-op
verification can run with live services. These checks supplement the deployment
admission drain: keep all runtime and backup processes stopped, and prevent new
connections for the whole migration window. The migrator does not terminate
sessions or change administrator-owned connection admission.

For an existing database that previously allowed PUBLIC CONNECT, first stop
its services and quarantine new admission with `ALLOW_CONNECTIONS false` from
an administrator connection to another database. Commit the corrected grants,
inspect existing sessions, and have the administrator remove outside sessions.
Reopen admission only after the ACL is correct and those sessions are gone,
then migrate before restarting services. A session retained from before the
revocation makes migration refuse even when the current grants look correct.
Removing a login from the environment alone does not revoke an old grant: make
the matching explicit provisioning change under the same quarantine procedure.

For an existing deployment:

1. Stop the web and worker containers so the old build cannot keep writing
   while its schema changes.
2. Take a database backup with PostgreSQL 18's `pg_dump --format=custom` and
   verify it can be read with `pg_restore --list`. Preserve the matching
   application encryption keys in a separate, encrypted backup. A database
   backup cannot replace the keys needed to read its encrypted fields.
3. Select the new image version in your deployment configuration. Run its
   migration command once, using the migration login for that database and the same container
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

   The command reads only `DATABASE_URL` and `STUDIO_DATABASE_ALLOWED_LOGINS`;
   authentication, mail, object storage, and client assets are not needed for
   schema administration. Keep credentials
   in the restricted environment file instead of putting them in shell history.

4. Start the application containers only after migration succeeds. Retain the
   backup and the old image reference until you have verified the upgrade.

The same command provisions a fresh empty database before its first start.
Repeated runs verify and leave applied migrations alone, while rechecking role
safety, committed access enrollment, and active connections.
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
versioned migrations. Runtime roles can read the schema fingerprint but cannot
write it, including through column-level grants, and cannot access migration
history. The runner reasserts those evidence restrictions after historical
sidecars on every run. Role safety and access checks are repeatable operator
invariants outside the immutable schema history; no numbered artifact is
rewritten to update them.

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
idempotence, two competing command processes, cross-database role races,
independent deployment login isolation, retained outside connections, unsafe
role attributes and memberships, checksum/history refusals,
transaction rollback, and real catalog/privilege assertions. The source guard
test also rejects a build whose newest migration does not match the current
fingerprint and ordered sidecars. Existing domain and tenancy suites still
test each constraint, trigger, and RLS boundary in depth.

Development keeps its separate `db:reset` workflow and destructive synthetic
seeding. It recreates `public` and discards migration history, then applies the
current definitions directly. The test fixtures and protocol demo retain this
developer-only schema helper; production has no `apply-schema` command.

The persistent server also requires `STUDIO_DATABASE_ALLOWED_LOGINS` outside
explicit local development. Supply the same complete, committed enrollment to
migration, startup, and readiness: database owner, runtime login, and separately
provisioned backup login. Shared cluster-wide runtime roles do not enroll a login
in another deployment. Revoking CONNECT does not disconnect an existing session;
administrator admission quarantine and session removal remain necessary.
Runtime admission verifies login capabilities separately from this enrollment.
Fingerprint/history ACL or owner-backed-action drift makes existing evidence
untrusted and requires investigation and verified-backup recovery, not an
in-process grant repair.
