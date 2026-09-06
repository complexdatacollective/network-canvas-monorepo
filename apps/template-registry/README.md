# Network Canvas Template Registry

The registry is an independent Node service and PostgreSQL datastore. It accepts
portable template artifacts, verifies their complete archive, schema, media,
metadata, license and content hashes, and serves them through public reads and
publisher-authenticated writes. Studio is an API client; its server and SPA are
not included in this image.

## Contracts and ownership

The Zod/oRPC source in `src/contract.ts` generates the OpenAPI 3.1 contract in
`spec/openapi.json` and at `/api/v1/openapi.json`. The wire API uses `/api/v1`,
RFC 9457 problems and opaque cursor pagination. The shared exchange validator
and normative format live in `@codaco/studio-sync/template-exchange` and
`specifications/template-registry/`. Specification publication under CC0 is a
separate release requirement; these local files are its reviewed source.

A publisher belongs to a verified registry email account, with an optional
ORCID. The registry stores only hashes of its random `ncr1_` bearer tokens.
Account cookie operations require the configured origin. Publishing tokens
cannot administer other publishers or moderate content; moderation requires a
separate scope and current operator status. Studio instance API tokens are not
registry credentials.

Published template metadata and artifact bytes are immutable. Account holders
can update their publisher name or ORCID while retaining the same publisher ID.
A publisher can withdraw an entry from browsing; direct hash reads retain a withdrawal notice. Operators
can curate, suspend a publisher, take down an artifact, restore visibility, or
request audited hard deletion. Objects remain private, so every download checks
current moderation. Deletion retries retain their quota charge until object
removal succeeds. A bounded, delayed orphan scan handles uploads whose database
transaction did not commit.

Storage and publication/account/report/mail rates are bounded in PostgreSQL so
replicas share the limits. Process admission permits one publication or two
artifact downloads at a time. A download retains its capacity until its response
finishes or is cancelled, including real TCP backpressure. A busy process
returns a bounded problem and `Retry-After`; it does not allocate another full
archive. Uploads, private-store I/O and responses also have deadlines.

## Runtime and operator entry points

Build a clean checkout from the repository root:

```sh
pnpm --filter @codaco/template-registry build
pnpm --filter @codaco/template-registry test
pnpm --filter @codaco/template-registry typecheck
docker build --file apps/template-registry/Dockerfile \
  --build-arg SOURCE_REVISION="$(git rev-parse HEAD)" \
  --tag template-registry:local .
```

The Docker build prunes only this package's dependency closure and imports all
four final production entry points before succeeding. The image runs as a
non-root user. `dist/index.js` starts HTTP, `dist/migrate.js` applies versioned
migrations, `dist/operator.js` grants or revokes an existing verified account's
operator status, and `dist/backup.js` verifies the restricted backup identity.

`/healthz` is liveness. `/readyz` checks current versioned schema provenance,
matching app/operator database identity and the private object-store connection.
Runtime connections cannot access migration history; the history-table check
uses PostgreSQL catalogs. The listener is admitted only after those checks.
Shutdown stops admission, drains sockets, finishes bounded cleanup and exits
within 25 seconds.

The HTTP process requires `REGISTRY_PUBLIC_URL`, `REGISTRY_DATABASE_URL`,
`REGISTRY_OPERATOR_DATABASE_URL`, `REGISTRY_AUTH_SECRET`,
`REGISTRY_S3_ENDPOINT`, `REGISTRY_S3_REGION`, `REGISTRY_S3_BUCKET`,
`REGISTRY_S3_ACCESS_KEY_ID`, `REGISTRY_S3_SECRET_ACCESS_KEY`, and
`REGISTRY_MAIL_FROM`. Configure exactly one of `REGISTRY_SMTP_URL` or
`REGISTRY_POSTMARK_SERVER_TOKEN`; `REGISTRY_POSTMARK_MESSAGE_STREAM` optionally
selects a Postmark stream and otherwise defaults to `outbound`. Both transports
validate the sender at startup, preserve uncertain delivery outcomes and close
on shutdown. External object stores require HTTPS. The explicit
`REGISTRY_S3_INSECURE_PRIVATE_NETWORK` option is for an isolated private network.

Migrations and operator grants use only `REGISTRY_MIGRATION_DATABASE_URL` and
`REGISTRY_DATABASE_ALLOWED_LOGINS`, an explicit JSON array of the permitted
login identities. Backup verification uses only
`REGISTRY_BACKUP_DATABASE_URL`; it never falls back to an owner/runtime URL.
The service has no built-in development database, authentication or mail secrets.

The optional self-hosted files in `deployment/` are inputs to the single signed
Studio installer. They use separate registry roles, database, object bucket,
volumes and network. Managed deployment must use the required managed container
platform. See `deployment/README.md` for credentials, provisioning, offline
commands and the recovery boundary.

## Remaining issue integration

The minimal registry account/operation page is the next operational slice.
Person-owned encrypted Studio account connections, audited immutable version
publication records and provenance-preserving Studio import remain the separate
registry product followup; they do not block the managed hosting prerequisite.
Gallery browsing UI belongs to its own issue. Public specification publication,
independent backup and managed datastore restore qualification remain release
gates. Local tests and container drills establish engineering behavior; they
are not managed provider evidence.
