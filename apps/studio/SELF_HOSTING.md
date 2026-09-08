# Self-hosting Studio

The Studio image contains the server, browser client, immutable migrations and
operator commands. The production bundle runs one web service with durable
workers, PostgreSQL 18, a private MinIO bucket and Traefik HTTPS. The bundle
requires Docker Engine, Docker Compose, a POSIX shell, `jq`, and `sha256sum` or `shasum`
for recovery checks. Release signature verification has its own trusted-tool
prerequisite in the release instructions.

Use a host with at least 4 CPU cores and 8 GB RAM, encrypted persistent storage,
a public DNS name and inbound TCP 80/443. Reserve additional memory/storage for
your research workload and backups. PostgreSQL's measured starting profile is
1 GB shared_buffers and 256 MB work_mem; work_mem is a per-operation allowance,
not a process cap. Fifty database connections or several concurrent complex
aggregates can exceed 8 GB. Size admission and memory for the expected workload;
validate the aggregate qualification against the intended concurrency before
opening a large deployment. Server sessions inherit this profile even after
switching to the restricted application role.

## First installation

Download the release's signed manifest and verify its attestation using the
release instructions. It identifies the full source commit, all four Studio
package versions, migration head, Studio image and patched MinIO image.
Copy its digest-pinned image references into these variables. An image's
server package version alone does not identify a compatible release.

```sh
STUDIO_IMAGE='ghcr.io/complexdatacollective/studio@sha256:RELEASE_IMAGE_DIGEST'
MINIO_IMAGE='ghcr.io/complexdatacollective/studio-minio@sha256:RELEASE_MINIO_DIGEST'
mkdir studio
docker run --rm --network=none --read-only --user "$(id -u):$(id -g)" \
  --mount type=bind,source="$PWD/studio",target=/configuration \
  "$STUDIO_IMAGE" configure \
  --domain studio.example.org --email operator@example.org \
  --image "$STUDIO_IMAGE" --minio-image "$MINIO_IMAGE" --output /configuration
cd studio
```

The explicit `configure` command prints a setup URL and one high-entropy
bootstrap token once. Keep that terminal output private. It creates a mode 0600
`.env`, a separate mode 0600 `deployment/encryption.env`, and the deployment
files. It refuses any nonempty output directory.
The generated signing secret, token, metrics credential, database credentials,
scoped object-store credentials and three encryption roots are independent.
Nothing is contacted by configuration. Normal boot never prints credentials.
Back up both secret files immediately into encrypted, operator-controlled custody. An
independent key/configuration backup is essential; the database does not hold
the roots needed to recover encrypted contacts and integration credentials.
The encryption file contains only the keyset and its referenced roots; it is
the only env file loaded into the application. Add new roots there during
rotation and retain every historical PII, integration and blind-index root.
Never put administrative database or object-store credentials in that file.

The one domain setting is `STUDIO_DOMAIN`. Traefik's route and Studio's public
origin derive from it. Point its A/AAAA records at this host before requesting
HTTPS. If the default 172.30.240.0/24 Docker network conflicts with another
network, choose a free `STUDIO_PROXY_SUBNET` and an address within it for
`STUDIO_PROXY_IP`. Studio trusts only that reverse-proxy address.

```sh
docker compose up -d --wait postgres
docker compose up -d minio-init
docker compose -f docker-compose.yml -f deployment/migrate.yml \
  run --rm --no-deps studio migrate
docker compose -f docker-compose.yml -f deployment/encryption.yml \
  run --rm --no-deps encryption-verify
docker compose up -d studio
docker compose run --rm --no-deps studio diagnostics
docker compose up -d traefik
```

Migrations are explicit and never run at boot. The migration overlay supplies
the separate schema-owner login only to that one command.
`STUDIO_DATABASE_ALLOWED_LOGINS` is a JSON array that explicitly enrolls
`studio_migrator`, `studio_runtime`, `studio_maintenance_runtime` and
`studio_backup_login` for this bundle. Provisioning creates the database with
connections disabled, commits
the restricted CONNECT allowlist, then opens it. Migration validates that
already committed boundary and refuses unlisted or inherited access and
retained outside sessions. Correct an existing misconfigured database only
under explicit quarantine, removing outside sessions before migration. Each
deployment needs its own login identities; never reuse one enrollment across
isolated instances. The web service gets only the restricted application
login; the worker gets only the distinct restricted maintenance login. Neither
has DDL, superuser or CREATEROLE power.
The container administrator password, migrator password, backup password and MinIO root
credentials are not in the Studio service environment. Initialization creates
a private bucket and a distinct application user limited to reading/writing
its asset prefix. PostgreSQL and MinIO publish no host ports. Traefik uses a
file provider and holds no Docker socket or public dashboard.

Open the printed setup URL, paste the bootstrap token, and choose the instance
name and first owner's name, email and password. Completion creates the owner
and first team atomically, then takes the owner to sign-in. `/setup` thereafter
returns 404 permanently, including after deleting the original owner/team.
The configured token may remain in `.env`; the durable singleton makes it
single-use. A server restart, replay or concurrent submission cannot claim a
second owner. Self-hosted signup is invitation-only; the first owner can sign
in with the chosen password without a mail provider.

To deliver invitations and magic links, set both `SMTP_URL` and `EMAIL_FROM`
in `.env`, then recreate Studio. Use your provider's authenticated SMTP URL,
with URL-encoded credentials as necessary. Empty values leave delivery
unavailable rather than silently accepting mail. SMTP delivery can report
success only after the provider accepts the message. Set
`STUDIO_TELEMETRY='off'` to opt out of optional usage reporting; operational
logs and locally protected metrics remain available to the operator.

Optional Google OAuth uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`;
Microsoft uses `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and optionally
`MICROSOFT_TENANT_ID`. Register the matching provider callback at
`https://<STUDIO_DOMAIN>/api/auth/callback/google` or `/microsoft`. Supply each
provider's complete credential pair in `.env`; keep them out of the encryption
custody file and the setup form. Provider-verified email and a live invitation
are required to create a new self-hosted account.

## Roles, health and diagnostics

`STUDIO_ROLE='both'` is the default small-host topology. To separate web and
worker resources, set it to `web`, then start the worker profile:

```sh
docker compose --profile worker up -d studio worker
```

Only one `web` or `both` process is supported for a database schema. Sync and
short denial-summary windows live in that process. Startup refuses a second
web process; losing its dedicated database lock connection terminates it.
This is not a highly available or partition-fenced sync design. Stop the old
web process before replacing it. A worker exposes only operational endpoints;
it cannot serve authentication, researcher RPC, static pages or WebSockets.
Durable workers use database claim leases and can be replicated separately.

`/healthz` is process liveness. `/readyz` requires PostgreSQL connectivity,
the image's current schema fingerprint and private bucket access; Traefik
removes an unready backend. `/metrics` requires the separately generated
Bearer credential. The image's `diagnostics` command reports safe configuration
states and the actual database memory profile using a read-only runtime
session. It prints no key IDs, root values, passwords, tokens or URLs. It does
not create key proofs; its `rootsLoadable` value means only that configured
roots can be decoded. Actual historical-key verification runs before traffic
at startup and through the explicit `encryption verify` command.

SIGTERM stops new HTTP work and new job claims immediately, sends WebSocket
code 1001, waits for active HTTP/SMTP work and flushes pending denial summaries
before closing pools. Failed drain/flush exits nonzero. Docker's fifteen-second
grace exceeds Studio's ten-second hard limit. An unfinished durable lease can
be retried after expiry; do not assume external delivery is exactly-once.

## Upgrade and rollback

Keep the previous release's complete manifest, images and matching backup.
Do not change a server-semver tag in place. Every promotion uses a full-commit
image digest. The migrator rejects edited history, unapplied source changes,
unknown baselines and attempts to downgrade the schema.

Until a release specifically qualifies adjacent-version expand/contract
compatibility, use an admission-blocking maintenance window. Stop the proxy
and every web/worker process, not just the web listener. Make a consistent
backup before changing images. Capture the old configuration and image set
first; only then select the new signed manifest's image digests:

```sh
sh deployment/backup.sh /absolute/private/pre-upgrade-backup \
  /independent-encrypted-key-custody/pre-upgrade-keys.env
# Now update .env and release.json to the new verified release.
docker compose pull
# If the release requires new database roles, run its administrator-only
# role-provision step before invoking the NOCREATEROLE migrator.
# Backup closed both runtime logins and the migrator as well as stopping the services.
docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c 'ALTER ROLE studio_migrator LOGIN; ALTER ROLE studio_runtime LOGIN; ALTER ROLE studio_maintenance_runtime LOGIN;'
docker compose -f docker-compose.yml -f deployment/migrate.yml \
  run --rm --no-deps studio migrate
docker compose -f docker-compose.yml -f deployment/encryption.yml \
  run --rm --no-deps encryption-verify
docker compose up -d studio
docker compose run --rm --no-deps studio diagnostics
# Run the release's authenticated smoke test against the private backend.
# Reopen admission only after that succeeds. Start workers if separated.
docker compose up -d traefik
```

A date/time announcement does not block incompatible requests: the proxy and
writers must actually be stopped. Failed migration rolls back its transaction
and exits nonzero; keep admission closed while diagnosing it. A migrated
schema may make the old image incompatible. Roll back by restoring the
pre-upgrade database/object/configuration backup into fresh volumes with its
matching image, verify it privately, then reopen traffic. Never edit a stored
fingerprint, migration checksum or old migration file to make an image boot.
Existing pre-release databases without migration history require the explicit
export-to-fresh-install path in the bundled `MIGRATIONS.md`; they are never adopted
or destroyed automatically.

## Back up and restore

A complete recovery set has two separately held parts. The data archive contains
the database, object-store data, exact release manifest/images, `.env` and public
deployment configuration. The separate `encryption.env` custody file contains
every historical PII, integration and stable blind-index root and the keyset.
The data archive contains only this file's SHA-256 binding, never its contents.
Keep the mode 0600 custody file on operator-controlled encrypted storage in a
different backup location. Data-backup download credentials must not grant access
to it. Encrypt the data archive and restrict access as well. There is no
third-party escrow. Possession of the data archive alone cannot decrypt protected
fields. Retain the archive's encryption and authentication keys, storage recovery
credentials, and required MFA or account-recovery material in independent
operator custody too. The backup retains every Compose image in `images.tar`,
so restoration can load the required bytes without a registry login. A recovery drill must remain possible while all credentials
for the primary hosting and backup account are unavailable. Missing roots
lose encrypted contacts, sensitive attributes and integration credentials.
Stable participant codes, consent, sessions and collected network data remain
outside that encrypted tier, but still need normal research-data protection.

The backup command stops the proxy and every web/worker replica, disables the
two dedicated database logins, and refuses any remaining Studio connection
before capture. Stop independently launched maintenance commands too. A
refused capture leaves quarantine in place; it never kills an outside session
or silently restarts writers. The administrator closes admission; the dump uses
the separately provisioned `studio_backup_login`, which can assume only the
SELECT-only `studio_backup` role. The `backup-verify` Compose service invokes the
image's operator command, which first checks complete table, sequence, audit and migration-history access and
refuses write or inherited privileges. The dump explicitly enables row security.
This local Compose drill does not qualify a managed provider's backup service.
Choose a new path on encrypted storage, outside Docker volumes:

```sh
umask 077
BACKUP_DIR="/secure-backups/studio-$(date -u +%Y%m%dT%H%M%SZ)"
KEY_CUSTODY="/independent-encrypted-key-custody/studio-$(date -u +%Y%m%dT%H%M%SZ).env"
sh deployment/backup.sh "$BACKUP_DIR" "$KEY_CUSTODY"
```

The command first copies the complete encryption file to the new independent
custody path and verifies that exact key snapshot. It then takes a database
archive, stops MinIO and captures its volume, copies configuration while
excluding all roots, records data counts, and verifies its
checksum list before writing `COMPLETE`. Preserve the signed release manifest
and all matching image digests with it. A directory without `COMPLETE` is not
a successful backup. Referenced object bytes are captured after in-flight
uploads drain; a database-only snapshot is insufficient.

To resume the source after a successful backup, re-enable all three logins with
the administrator command shown above, start MinIO, run `encryption verify`,
and start Studio privately. Check diagnostics and an authenticated smoke
before starting the proxy and any separated workers. An unsuccessful capture
requires correcting the reported condition under quarantine first.

Restore into a new Compose project with empty named volumes. Copy the backed-up
configuration and matching digests, preserving credentials. Retrieve the
matching historical keyset from its independent custody location. The restore
project's proxy subnet must be unique if both
projects exist on the same Docker host. Preserve archive ownership; do not
rewrite immutable history or triggers.

```sh
export COMPOSE_PROJECT_NAME=studio-restore
sh deployment/restore.sh "$BACKUP_DIR" "$KEY_CUSTODY"
export COMPOSE_FILE=docker-compose.yml:deployment/recovery-images.yml:deployment/quarantine.yml:deployment/encryption.yml
docker compose run --rm --no-deps encryption-verify
docker compose up -d studio
docker compose run --rm --no-deps studio diagnostics
```

Restore refuses missing or incorrectly bound key custody before starting
PostgreSQL or writing data. It verifies checksums and requires every retained
image ID to appear in the actual archive load, so a warm image cache cannot hide
an incomplete archive. The generated recovery image override runs those exact
local content IDs with `pull_policy: never`, independent of registry names or
credentials. Keep it in `COMPOSE_FILE` for every recovery command. Docker's
[image load contract](https://docs.docker.com/reference/cli/docker/image/load/)
restores images and tags; recovery does not rely on registry digest names
surviving a change of Docker storage backend.

Restore privately snapshots regular, non-symlinked backup and custody inputs,
then verifies and consumes only that snapshot. Before the first restore write it
uses host `jq` and successful Docker inventories to require a new resolved
Compose project with unused local named volumes and networks; bind mounts and
existing project resources refuse before image loading, service startup, or
database quarantine. Only after that gate does it commit `NOLOGIN` for all three
application, maintenance, and migration writer logins, then terminate and
reject surviving writer sessions in a separate step. Its exit trap repeats that
quarantine after success, failure, or a signal.
It also reapplies the generated administrator-owned large-object and temporary
schema privilege boundary after `pg_restore`, because the logical dump does not
carry PostgreSQL built-in function ACLs. Restore refuses populated volumes or
retained database sessions, and restores the archive in one transaction. The
quarantine overlay runs only the web role on the private data network, with mail
and optional telemetry disabled. The process has no external network route. Do
not start the production proxy or workers until validation finishes.

After successful validation, remove only `:deployment/quarantine.yml` from
`COMPOSE_FILE` before starting the proxy and the selected worker topology. Keep
the recovery image override until a subsequent verified release explicitly
replaces it.

Privately check owner sign-in, team/study data, an authorized encrypted contact
read, retained opt-out suppression, authorized OAuth credential read and a
signed webhook against a local synthetic receiver. Verify every referenced
asset's SHA-256. Compare audit and migration-history counts with the backup;
a successful empty dump is a failed backup. A pre-rotation backup must restore
with its historical key IDs and exact root material for PII, integrations and
stable blind indexes. A missing ID or wrong root in each purpose must refuse
startup. Keep the source stopped until its replacement is qualified so two
installations cannot diverge. Restore never resets completed setup.

For external PostgreSQL, use the provider's qualified export or a dedicated
operator-only backup identity that can SELECT every forced-RLS table and
immutable global audit/history table. Schema ownership alone does not bypass
FORCE RLS. Never give runtime maintenance extra audit-read or bypass rights to
make pg_dump work. Registry databases and object stores have their own recovery
procedure and must also be captured wherever the registry is deployed.

## PostgreSQL major upgrades and storage

The bundle pins PostgreSQL 18 and mounts `/var/lib/postgresql`, whose versioned
PGDATA layout is new in 18. A new major image cannot read the old data directory
in place. Changing only the image tag is not a major-upgrade procedure.

Use PostgreSQL's logical dump/restore procedure into a new volume: block
admission and stop every writer, take a tested complete backup with the old
major's clients, provision the new supported major with the reviewed profile
and safe roles, restore, apply any release-required Studio migration, verify
keys, run aggregate/read/write/asset smoke tests and compare counts. Reopen
only after success. Retain the old volumes and image for rollback; never
mount one data directory into two PostgreSQL major versions. `pg_upgrade` is
an alternative only with separately qualified binary/extension compatibility
and its `--check` passing; the bundled procedure uses logical restore.

Use encrypted disks/volumes for PostgreSQL and MinIO and encrypted backups.
Container volumes alone do not encrypt data. Keep all private ports private,
monitor free disk and backup freshness, and rotate the signing/SMTP/storage
credentials through their own service procedures. For PII and integration
root rotation, retain all historical roots and index keys and follow the
image's bounded `encryption rotate` procedure. Index rotation is separate from
ciphertext rotation; never discard suppression keys when erasing a contact.

## Operator responsibilities

| Area               | Software provides                                                                | Operator provides                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport          | HTTPS proxy configuration, trusted-proxy handling, application rate limits       | DNS, certificate contact/renewal checks, allowed inbound ports and WebSocket-compatible upstream proxies                                                        |
| Stored data        | Application encryption of protected fields, tenant RLS, immutable audit evidence | Encrypted PostgreSQL/MinIO disks and backup media; access controls for the host and container administration                                                    |
| Key custody        | Explicit key versions, historical-key verification and bounded rotation commands | Independent encrypted custody of every retained PII, integration and blind-index root; separate access from data-backup credentials                             |
| Recovery           | Quiesced capture and restore guards, image-level recovery qualification          | Scheduled complete backups, retained immutable images, independent key copies, periodic populated restore/content-integrity drills and disk-capacity monitoring |
| Updates            | Versioned migrations, immutable release identity and release qualification       | Verify the release trust policy, apply supported upgrade hops, drain all writers, smoke-test privately and reopen only after success                            |
| Network and access | Private datastore services and separate runtime/migration identities             | Host firewall, administrative login policy, SMTP/OAuth provider configuration, role enrollment and secure incident access                                       |

The qualified baseline is four CPU cores and eight GB RAM, with PostgreSQL
bounded to four cores and six GB during the deployment gate. The gate runs the
three #1378 aggregates at both 1× and 10× study scale: respectively 2,500 and
25,000 sessions including two noise tenants, generated networks, forced RLS,
and active shared-outbox work. It checks results against the generated graphs
and requires p95 below one second over thirty iterations. Other host sizes and
higher concurrency require the same qualification before being advertised as
supported; PostgreSQL setting values alone do not establish capacity.

Primary operational references: [PostgreSQL 18 upgrades](https://www.postgresql.org/docs/18/upgrading.html),
[official PostgreSQL image volume layout](https://hub.docker.com/_/postgres),
[Compose service configuration](https://docs.docker.com/reference/compose-file/services/),
[Traefik file routing](https://doc.traefik.io/traefik/reference/dynamic-configuration/file/),
and [the MinIO source security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).
