# Database backup identity

Studio's dedicated `studio_backup` role reads every tenant, immutable audit
record, encrypted credential row, migration record and sequence state. It is
separate from `studio_app` and `studio_maintenance`, cannot log in directly,
and requires neither superuser nor `BYPASSRLS`. Migration `0005_readonly_backups`
adds an explicit unrestricted SELECT policy to each tenant table and narrow
read grants. Existing write policies and audit immutability remain enforced.

Provision a dedicated, deployment-specific backup LOGIN with `NOINHERIT`,
`NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE` and `NOREPLICATION`.
Its only role membership is `studio_backup`, with `SET TRUE`, `INHERIT FALSE`
and `ADMIN FALSE`. When the migrator cannot create roles, the administrator
precreates the safe NOLOGIN role before running migrations. Keep the backup
login in the migration's explicit database CONNECT enrollment; follow
[the migration provisioning procedure](MIGRATIONS.md) before opening database
admission. Keep its credentials out of the web and worker environments.

Immediately before each dump, run the matching image's separate operator
command with only the backup connection URL supplied through `DATABASE_URL`:

```sh
DATABASE_URL="$STUDIO_BACKUP_DATABASE_URL" node dist/backup.js
```

The command starts no HTTP server, authentication service or worker. It accepts
no arguments and requires no application encryption keys. Success prints
`Studio backup access verified.`; any failure exits 1 with the fixed diagnostic
`STUDIO_BACKUP_ACCESS_UNSAFE`, without the connection string or provider error.
Treat a failure as a failed backup attempt and correct the drift before retrying.

The verification uses the actual pinned role and connecting login. It checks
their attributes, memberships, ownership and effective privileges, including
column grants, updatable views, foreign tables, sequences and callable
SECURITY DEFINER routines. This includes privileges exposed by `SET ROLE NONE`.
Every row-protected table must retain its unrestricted `backup_read` policy;
an applicable restrictive read policy refuses the dump. The image's expected
schema and migration evidence must be present and its fingerprint current.

Use PostgreSQL 18's `pg_dump`, the same dedicated login and explicit backup
role. For example, configure a `studio-backup` libpq service and a protected
password file, then run:

```sh
PGSERVICE=studio-backup pg_dump --role=studio_backup --enable-row-security \
  --no-owner --format=custom --file=studio.dump
```

`--enable-row-security` is intentional: the preceding verification proves the
backup policies admit every row. Without that check, a successful dump can omit
inaccessible rows. The service and verification command must point to the same
deployment and login. Do not change schema or grants between verification and
capture; the operator's coordinated backup procedure quiesces writers and
migration activity during capture.

The database dump contains encrypted data and key-presence proofs, never the
external historical root keys. Restore also requires the matching independently
held keyset, every referenced object and a compatible image. Store the dump and
objects encrypted, separately from decryption material and recovery credentials.
Restoring database bytes alone does not qualify application recovery. Keep a
restored deployment quarantined until its current authorization, credential and
delivery state has been reconciled.

Before any restored Studio process or writer LOGIN is admitted, verify the
restored object bytes from the matching image with the dedicated backup login:

```sh
DATABASE_URL="$STUDIO_BACKUP_DATABASE_URL" \
STUDIO_DATABASE_ALLOWED_LOGINS='["studio_owner","studio_app_login","studio_maintenance_login","studio_backup_login"]' \
S3_ENDPOINT="$RECOVERED_S3_ENDPOINT" S3_REGION="$RECOVERED_S3_REGION" \
S3_BUCKET="$RECOVERED_S3_BUCKET" \
S3_ACCESS_KEY_ID="$RECOVERED_S3_ACCESS_KEY_ID" \
S3_SECRET_ACCESS_KEY="$RECOVERED_S3_SECRET_ACCESS_KEY" \
node dist/recovery-assets.js
```

Use the deployment's real complete enrollment list; the names above only show
the required JSON form. The command accepts no arguments and starts no server,
authentication service or worker. It requires the application and maintenance
LOGINs to be `NOLOGIN`, refuses their surviving sessions and prepared
transactions, and verifies the current schema and dedicated read-only backup
identity on one pinned `REPEATABLE READ READ ONLY` transaction. It counts and
keyset-pages every restored `public.assets` row, then streams each corresponding
`assets/<sha256>` object through an exact byte-size and SHA-256 check without
buffering the object. Acquisition, database statements, each object request,
stream-idle period, whole object and the complete operation have deadlines;
timeout cancels the object request or stream and discards an interrupted
database borrower.

Success prints `Studio recovered assets verified (<count>).`. Missing,
truncated, corrupt, oversized or stalled objects, an incomplete inventory,
schema or privilege drift, and a writer that is still admitted all exit 1 with
the fixed diagnostic `STUDIO_RECOVERED_ASSET_VERIFICATION_FAILED`. This is an
integrity gate inside recovery quarantine. It neither repairs objects nor
reconciles authorization, delivery state or credentials, and it does not reopen
the deployment.

The regression suite uses a real separately authenticated backup login, two
tenants including closed studies, protected participant data and immutable audit
evidence. It compares every schema table and migration row using counts and
content digests, captures a real restricted `pg_dump`, restores into an isolated
database, and compares every row digest and sequence value again. Negative
controls prove unsafe grants can actually write through views/definer functions,
then require verification to refuse them. Managed retention and complete
application restore drills remain additional deployment qualification
requirements.
