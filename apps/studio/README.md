# Network Canvas Studio

Cloud-based, multi-tenant platform for designing network interview protocols
and collecting network data remotely. Specified by the issue tree rooted at
[#1242](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1242);
the architecture follows the ADR recommendations and recorded decisions on
[#1245](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1245)
(framework and deployment topology),
[#1246](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1246)
(datastore), [#1247](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247)
(sync), and [#1248](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1248)
(API surfaces).

## Layout

Studio is two independently deployable halves plus one shared leaf — the
package diamond decided 2026-08-11 on
[#1244](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1244).
There is deliberately **no client↔server dependency edge**: the halves share
only the boundary package, so changesets and release CI re-gate a half only
when its boundary moved.

- `client/` — `@codaco/studio-client`: Vite + React SPA (TanStack Router,
  TanStack Query, `@codaco/fresco-ui`). Builds to static assets; talks to the
  server through typed oRPC procedures, importing the boundary contract
  type-only.
- `server/` — `@codaco/studio-server`: Hono app on `@hono/node-server`
  (Node 24 baseline), one persistent process serving every surface below. It
  serves no client assets in any topology — nginx does, from the `studio-web`
  image (#1909). A second process built from the same source runs background
  jobs and nothing else (see [Background work](#background-work)), and a
  third creates the schema and exits. It owns the database:
  `src/db` holds the pool and the schema, and `src/protocol` is the sectioned,
  content-addressed protocol store (#1276) built on top of it.
- `packages/studio-rpc` — `@codaco/studio-rpc`: the internal RPC boundary
  (Zod schemas + typed oRPC contract). The only shared code between the
  halves.
- `packages/studio-sync` — `@codaco/studio-sync`: the sync protocol core
  (#1247). Isomorphic: the client imports its apply engine, the server its
  lease and commit engine and the schema those run against. It also carries the
  declarations that are schema without being tables — the database roles, and
  the background queues.

## Surfaces

Three surfaces, one domain layer beneath them, none generated from another
(per the 2026-08-11 decision on #1248):

| Path       | Surface                  | Consumers                              | Stability                                             |
| ---------- | ------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `/rpc`     | Internal RPC (oRPC v2)   | The SPA only                           | Unpublished, free-moving                              |
| `/api/v1`  | Public data API (REST)   | Researchers, external tools            | OpenAPI 3.1 (`/api/v1/openapi.json`), RFC 9457 errors |
| `/ws`      | Sync protocol            | The SPA's editor                       | Unpublished, protocol-versioned (#1247)               |
| `/storage` | Asset bytes (plain HTTP) | The SPA (upload), interviews (stimuli) | Unpublished; content-addressed, immutable (#1278)     |

Asset bytes live in S3-compatible object storage (#1246): Cloudflare R2 in
the managed topology, Garage (or any S3-compatible endpoint) self-hosted and
in development.
Objects are keyed by content hash, so `/storage/:hash` responses are
immutable-cacheable by construction. Files ride plain HTTP rather than the
RPC surface — uploads must stream, retrievals must cache.

Uploading is session-gated and same-origin-gated exactly like `/rpc`: a write
is 100 MB of someone else's bucket, and the SPA is its only caller.
Retrieval is open — a content address is unguessable, interview stimuli are
fetched from contexts that carry no cookie, and a session lookup per request
would put the database on the delivery path.

Uploaded bytes are untrusted and `/storage` is the app's own origin, so
retrieval never reflects the uploaded `Content-Type` blindly: only media a
browser cannot turn into script (the common image, audio, and video types) is
served inline with its own type, and everything else — HTML, SVG, anything
unrecognised — is served as `application/octet-stream` with
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and a
`default-src 'none'; sandbox` CSP. Rendering SVG stimuli inline needs an
isolated asset origin first.

### Rate limiting

Every surface above is rate-limited, and every counter lives in Valkey — the
Redis-compatible service in the stack, named by `REDIS_URL` (#1909). That is
the whole point of it being there rather than in each process's memory: a limit
has to mean the same thing whether one API container is running or two, and the
limiters this replaced did not — better-auth's sign-in counters were rows in
Postgres, and the audit denied-attempts window was a `Map`.

There is a limit per scope, where a scope is a surface plus the kind of subject
it is counted against: sign-in per client address and per email; invitation
acceptance per token; participant redemption per address and per link, and
participant sync writes per session (declared here, enforced when the
participant routes land with #1899); RPC per user and per team; storage reads
per address; the public API per token, or per address with none; and WebSocket
upgrades per user. Each is one `RATE_LIMIT_*` variable in
[Environment](#environment), written as `count/window`. Subjects are hashed
before they become key material, so no address or email address sits in the
store in clear, and a refused call is logged with its scope and its
retry-after and never with whom it refused.

A refused call answers 429 with `Retry-After` and RFC 9457 problem JSON; a
refused RPC call is `TOO_MANY_REQUESTS` with the same header, and carries the
retry-after in its error data as well, because a call arriving over the
WebSocket has no response headers to read it from.

**It fails open.** A Valkey that cannot be reached allows every call, logs one
line a minute while it is down, and shows as `limiter: degraded` on `/readyz`,
which stays 200. A rate limit protects against abuse and is not a correctness
guarantee; refusing traffic because the defence is broken would turn an abuse
control into an outage.

The suites that exercise any of this — the limiter's own, and the three cases
in `server/src/team/__tests__/commands.test.ts` that assert where the audit
denial window's cap falls — need the development lane's Valkey running and
skip without it, because a limiter that fails open cannot be observed
enforcing anything; on CI they throw instead, where the store is part of the
job.

What was refused is reported once a minute by the `denied-attempts-summary`
job on the worker (see [Background work](#background-work)). Suppressed
authorization denials become one
`security.denied_attempts.rate_limited` event per actor, team, operation and
minute in that team's audit log; the scopes with no team behind them — sign-in,
storage, the public API — become one log line per scope per run, with a count
and nothing else.

## Development

```bash
pnpm --filter @codaco/studio-server dev
```

One command. It brings up the backing services in Docker, bootstraps the
object store, resets and reseeds the database, and then runs the server, the
worker and the client together under one process group.

You need Docker Engine 25.0 or newer with the Compose plugin at v2.23.1 or
newer (the stack keeps its Traefik and Garage configuration inline in the
compose file, which older versions cannot read), pnpm, and Node 24.

### What it starts

The services are the ones the reference stack ships —
`apps/studio/docker-compose.yml` with `docker-compose.dev.yml` over it, which
publishes them on the host loopback and adds a mail sink. They run under the
Compose project `studio-dev`. `traefik`, `web`, `api` and `worker` stay
stopped: in development those processes run from source with watch and HMR
instead.

| Service  | Address                   | What it is                                              |
| -------- | ------------------------- | ------------------------------------------------------- |
| Postgres | `127.0.0.1:54318`         | database `studio_dev`, reset and reseeded on every boot |
| Garage   | `127.0.0.1:9100`          | the S3-compatible object store; bucket `studio-dev`     |
| Valkey   | `127.0.0.1:63790`         | Redis-compatible, for rate-limit counters               |
| Mailpit  | `127.0.0.1:1025`, `:8025` | SMTP sink and its inbox at <http://localhost:8025>      |

And from the checkout:

| Process | Address                 | What it is                                            |
| ------- | ----------------------- | ----------------------------------------------------- |
| client  | <http://localhost:5173> | Vite, with HMR — **this is the URL to open**          |
| server  | `127.0.0.1:3000`        | the `serve` process; restarts on source changes       |
| worker  | —                       | background jobs and cron schedules; restarts likewise |

Two processes, one origin: the Vite dev server serves the SPA and proxies
`/api`, `/rpc`, `/storage`, `/healthz`, and `/ws` to the server — playing the
role Traefik plays in a deployment, so the browser sees a single origin in
every topology.

The ports are fixed rather than branch-scoped, so one machine runs one Studio
development stack at a time. If `pnpm dev` finds a container from the scripts
this replaced (`studio-dev-pg-*`, `studio-dev-minio-*`) still holding one of
them, it stops that container and says so.

Nothing is set by hand. The committed `server/.env.development` carries every
value the server needs, and `scripts/dev.ts` hands the same values to Compose —
both from the `DEV` constants in `src/env/catalogue.ts`, so the containers and
the server's configuration cannot drift apart. It also writes
`secrets/postgres-password` and `secrets/studio-secrets-key` if they are
absent, because the compose file takes both as file secrets. The keyring value
it writes is the one `.env.development` carries as `STUDIO_SECRETS_KEY`, from
the same `DEV` constant, so a server started from the checkout and one started
from the stack read the same development keyring.

### Resetting, stopping and wiping

**Every `pnpm dev` boot resets and reseeds the dev database** — before anything
else starts, `dev.ts --prepare` drops and recreates the schema, reapplies it,
and reruns `seed` (the same `resetSchemaAndSeed` sequence `db:reset` runs on
demand, minus `db:reset`'s sweep of leftover `studio_test_*` schemas and
databases, which cannot tell a leftover from a suite running in another
checkout), rather than only provisioning the schema the first time. The
server, the worker, the client and the log-tailing `dev.ts --follow` start only
once that has finished, so the server never verifies a schema that is about to
be dropped under it. Nothing in the dev Postgres survives a restart of
`pnpm dev` (the server's own `--watch` restarts do not reset anything); if you
need a protocol draft or other manual change to persist across restarts, keep
the session running rather than cycling `pnpm dev`.

```bash
pnpm --filter @codaco/studio-server dev:down              # stop the services
pnpm --filter @codaco/studio-server dev:down -- --volumes # and wipe their data
```

`dev:down` is `docker compose -p studio-dev … down`; `--volumes` adds `-v`,
which discards the Postgres and Garage volumes. Wipe them when a schema change
leaves the database in a state a reset cannot reconcile, or to reclaim the
space; a plain `dev:down` keeps them, and the next `pnpm dev` reseeds anyway.

### Inspecting the services

Mailpit's inbox is at <http://localhost:8025>. Garage has no web console; ask
it directly:

```bash
docker compose -p studio-dev exec garage /garage status
docker compose -p studio-dev exec garage /garage bucket list
docker compose -p studio-dev exec garage /garage bucket info studio-dev
```

(The binary is `/garage` rather than something on a `PATH`: the image is built
`FROM scratch` and has no shell, which is also why the stack bootstraps the
bucket through Garage's admin API rather than by running a command in the
container.)

The server's asset integration tests run against this Garage and skip when no
object store is reachable; its database integration tests skip when no Postgres
is reachable.

### Pointing at an external Postgres

In production the connection comes from `DATABASE_URL`; when it is unset the
server still boots and database-backed surfaces refuse, mirroring the S3
degradation contract. Locally, put an override in a gitignored `server/.env`,
which is loaded after `.env.development` and so wins:

```
DATABASE_URL=postgres://user:password@127.0.0.1:5432/studio
```

The boot reset follows that override — it resets and seeds the database the
server process will actually use, not the default it replaced — but only while
the target is on this machine. A `DATABASE_URL` naming any other host is left
alone, and the development marker refuses it outright (see
[Environment](#environment)). The stack's own Postgres container still starts;
stop it with `dev:down` if you would rather it did not.

The port and credentials of the stack's Postgres are what
`packages/studio-sync`'s conformance suite expects, so the one container serves
both.

### Signing in during development

Authentication (better-auth behind the `src/auth` seam, per #1245/#1255) is
active by default in development: the auth schema is applied to the dev
Postgres at boot, and magic-link and team-invitation email is sent through
Mailpit — submit the sign-in or invitation form, then open the message at
<http://localhost:8025> and follow its link. The worker sends it over SMTP
exactly as it would to a real transport, so the delivery path under test is the
deployed one. (Clearing `SMTP_URL`, to work without Docker's mail sink, falls
back to printing the link to the server console instead.)

The fastest way in needs no email step at all: every reseed creates a fixed
admin account, `admin@studio.test` / `studio-admin-not-for-production`,
that owns every seeded team. Choose "Sign in with a password instead" on the
sign-in screen, or drive the endpoint directly —

```bash
curl -i http://localhost:5173/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:5173' \
  -d '{"email":"admin@studio.test","password":"studio-admin-not-for-production"}'
```

— and carry the response's session cookie into the browser, or use it directly
against `/api/v1` and `/rpc`.

Auth configuration follows the same all-or-nothing, fail-fast shape as S3;
every variable is catalogued under [Environment](#environment) below.

### Running the whole stack locally

```bash
pnpm --filter @codaco/studio-server dev:stack
```

The other lane. Where `dev` runs the backing services in containers and the
Studio processes from source, `dev:stack` runs **what a self-hoster runs**: it
builds `studio-api:local` and `studio-web:local` from this checkout, brings up
the complete `docker-compose.yml` — Traefik terminating TLS, nginx serving the
built client, the API and the worker from the image — and then runs the
`migrate` one-shot and forwards its output, including the first-run setup
token. It ends by printing the URL.

Open **<https://localhost>**. Traefik serves its own self-signed certificate, so
a browser warns once and `curl` needs `-k`:

```bash
curl -k https://localhost/readyz
```

Paste the printed token into `https://localhost/setup` to create the first owner
account, exactly as a self-hoster does.

Use it to exercise what the development lane cannot: the routing table, the
maintenance page while `api` is stopped, the `migrate` one-shot against a
deployed schema, the first-run screen, and an upgrade — before any of them
reach someone else's host.

```bash
pnpm --filter @codaco/studio-server dev:stack:down              # stop it
pnpm --filter @codaco/studio-server dev:stack:down -- --volumes # and wipe its data
```

Wiping the volumes is how you get a fresh first-run setup: the next `dev:stack`
starts from an empty database and prints a new token.

Three things worth knowing:

- **It runs beside `pnpm dev`.** Different Compose project (`studio-stack`),
  different subnet, and no shared ports: the stack publishes 80 and 443, which
  the development lane does not use, and its Mailpit asks for an ephemeral
  loopback port rather than taking the development lane's fixed 1025 and 8025.
  Ask Docker where its inbox landed —
  `docker compose -p studio-stack port mailpit 8025` — which `dev:stack` also
  prints.
- **It writes a gitignored `apps/studio/.env.local`** with the development
  credentials from the `DEV` constants, and rewrites it on every run. The one
  value it reads back rather than regenerating is `BETTER_AUTH_SECRET`, so
  restarting does not sign the owner account out.
- **The differences from a deployment are three lines in
  `docker-compose.local.yml`**, and the production file is not modified: a
  certificate authority that does not answer (so Traefik falls back to its
  self-signed certificate instead of asking Let's Encrypt for `localhost`), a
  Mailpit sink, and `build:` sections so both images can come from this
  checkout.

### Changing the schema

There is deliberately no migration system yet. Pre-release, a schema change
means reconciling or recreating the database rather than migrating it —
`drizzle-kit push` semantics. Real migrations (`drizzle-kit generate`, from
the same table definitions) must land before a release carries data worth
keeping.

Studio has one schema, defined as Drizzle tables in seventeen modules that live
with their owners, plus the queue declarations beside them:

- better-auth's tables — `server/src/db/auth-schema.ts`
- the sync engine's drafts, sections, manifests, leases and command log —
  `packages/studio-sync/src/schema.ts`
- the protocol store's versioning tables, and the sealed API keys of its
  `apikey` assets — `server/src/protocol/schema.ts`
- protocol asset metadata — `server/src/asset/schema.ts`
- the study spine: studies, waves, participants and their plain contact
  columns, interview sessions and interview links —
  `server/src/study/schema.ts`; study roles —
  `server/src/study/roles-schema.ts`
- the collected network: snapshots, nodes, edges and the per-session rollups —
  `server/src/network/schema.ts`
- consent documents and records — `server/src/consent/schema.ts`
- schedules, prompts, message templates, deliveries and opt-outs —
  `server/src/schedule/schema.ts`
- team-owned API tokens — `server/src/token/schema.ts`
- templates and the gallery — `server/src/template/schema.ts`
- webhooks — `server/src/webhook/schema.ts`
- experiments — `server/src/experiment/schema.ts`
- feedback reports — `server/src/feedback/schema.ts`
- monitoring rollups — `server/src/monitoring/schema.ts`
- immutable audit history, its staged exports and its alert outbox —
  `server/src/audit/schema.ts`
- durable invitation delivery — `server/src/team/invitation-delivery-schema.ts`
- the background queues — `packages/studio-sync/src/jobs.ts`: every queue
  Studio declares and how each one retries and expires, the cron schedules the
  worker registers, what a job on each queue may carry, and what the two
  database roles may do with pg-boss's tables. Declarations rather than Drizzle
  tables — pg-boss owns the tables (see [Background work](#background-work))

The PL/pgSQL immutability functions and triggers, which Drizzle cannot express,
ride in raw-SQL sidecar exports beside their tables — as do the parts of
row-level security that drizzle-kit does not manage: the roles, `FORCE ROW
LEVEL SECURITY`, and the grants (see [Tenancy](#tenancy)).
`server/src/db/schema.ts` collects all of it into the `SCHEMA` and `SIDECARS`
exports that `server/scripts/apply.ts` applies. Sidecar order carries a rule
the test suite pins: the broad grant over every table runs first, right after
the roles are created, and every narrower revocation (the outboxes, the audit
log) runs after it, because a revocation placed before the broad grant is
silently undone by it. There are no migrations: Studio is in active
development with no live data, so a database whose schema is not this build's
is reset and reseeded (`db:reset`, and every `pnpm dev` boot) rather than
migrated. The versioned migration system arrives with the first release that
has data to keep.
The policies themselves are `pgPolicy` entries on the table definitions, which
is why `drizzle-kit` is pinned to the 1.0 release candidate: the stable line's
`push` silently drops their `USING`/`WITH CHECK` expressions.

pg-boss's own schema, `pgboss`, is part of what a schema application installs.
`apply-schema` runs pg-boss's construction plan, applies the grants that sit
beside the queue declarations, and creates or updates every declared queue. No
process migrates pg-boss at start. That plan's SQL, those grants and the queue
declarations are all hashed into the fingerprint, so a pg-boss upgrade or a
change to a queue's retry, expiry or dead-letter settings is a schema change
like any other: applied once by `apply-schema`, and refused at boot by every
process until it has been. Pre-release, a version difference is resolved the
way the rest of the schema is — by replacement rather than migration. A
database whose installed pg-boss schema is not this build's version is dropped
and reinstalled, which discards every job that was queued in it; `apply-schema`
logs how many that was before it does it.

<!-- generated:schema-docs start -->

#### Generated entity-relationship diagram

<!-- Generated by `pnpm --filter @codaco/studio-server sync-fingerprint` from the assembled Drizzle schema and raw-SQL sidecars. Do not edit by hand. -->

[![Network Canvas Studio entity-relationship diagram](./schema-erd.svg)](./schema-erd.svg)

Open the image for the full-size diagram. Tables with row-level security or trigger sidecars carry those details as SVG tooltips. The diagram shows physical foreign-key constraints; deliberately unconstrained logical references are not drawn as relationships. The renderer uses `1`/`*` edge endpoints, so optionality remains visible through each column's not-null marker rather than the edge.

Schema fingerprint: `27af5dd22c9dbb048d4c32aa04d125dfee654bfbe1907421b2ca7023b30b897f`.

Sidecar behavior that cannot be represented as ERD relationships:

| Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Sidecar-enforced behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `studio_app` (NOLOGIN NOSUPERUSER NOBYPASSRLS); `studio_maintenance` (NOLOGIN NOSUPERUSER NOBYPASSRLS); the applying login receives SET on both roles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Schema and sequences                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Both roles receive schema USAGE plus USAGE and SELECT on all sequences.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| All Studio tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Both roles initially receive SELECT, INSERT, UPDATE, and DELETE through the access sidecar; table-specific revocations below are applied afterwards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `drafts`, `sections`, `manifests`, `leases`, `command_log`, `protocols`, `protocol_versions`, `version_sections`, `protocol_drafts`, `protocol_asset_keys`, `protocol_events`, `protocol_write_receipts`, `assets`, `asset_references`, `studies`, `study_waves`, `participants`, `interview_sessions`, `interview_links`, `session_snapshots`, `nodes`, `edges`, `session_stats`, `session_degree_hist`, `study_role_grants`, `consent_documents`, `consent_items`, `participant_consents`, `participant_consent_item_responses`, `study_schedules`, `schedule_occurrences`, `message_templates`, `message_deliveries`, `message_delivery_events`, `participant_contact_optouts`, `api_tokens`, `templates`, `template_versions`, `template_version_sections`, `webhook_subscriptions`, `webhook_deliveries`, `experiments`, `experiment_assignments`, `experiment_exposures`, `feedback_reports`, `study_wave_rollups`, `study_stage_rollups`, `team_invitation_deliveries`, `audit_events`, `audit_export_jobs`, `audit_alert_outbox` | Drizzle policy `team_isolation`, `audit_team_isolation` plus sidecar FORCE ROW LEVEL SECURITY and tenant-table DML grants.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `sections`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `sections_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.doc IS DISTINCT FROM OLD.doc) → `sections_are_immutable()`; `sections_hold_no_asset_keys`: BEFORE INSERT → `sections_hold_no_asset_keys()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `protocol_versions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `protocol_versions_immutable`: BEFORE UPDATE OR DELETE → `protocol_versions_are_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `version_sections`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `version_sections_immutable`: BEFORE UPDATE OR DELETE → `protocol_versions_are_immutable()`; `version_sections_insert_frozen`: BEFORE INSERT → `version_sections_pins_are_frozen()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `asset_references`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `asset_references_published_immutable`: BEFORE UPDATE OR DELETE; FOR EACH ROW WHEN (OLD.referrer_kind IN ('protocol_version', 'template_version', 'consent_document')) → `asset_references_published_pins_are_frozen()`; `asset_references_insert_frozen`: AFTER INSERT → `asset_reference_pin_is_written_at_publication()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `assets`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `assets_metadata_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.media_type IS DISTINCT FROM OLD.media_type OR NEW.media_class IS DISTINCT FROM OLD.media_class OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.original_filename IS DISTINCT FROM OLD.original_filename OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id OR NEW.dataset_metadata IS DISTINCT FROM OLD.dataset_metadata OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `assets_metadata_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `studies`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `studies_closed_read_only`: BEFORE UPDATE → `studies_closed_is_read_only()`; `studies_go_live_final`: BEFORE UPDATE; FOR EACH ROW WHEN (OLD.went_live_at IS NOT NULL AND (NEW.participation_mode IS DISTINCT FROM OLD.participation_mode OR NEW.went_live_at IS DISTINCT FROM OLD.went_live_at)) → `studies_go_live_is_final()`; `studies_protocol_line_unpinned`: AFTER UPDATE OF protocol_id; FOR EACH ROW WHEN (NEW.protocol_id IS DISTINCT FROM OLD.protocol_id) → `studies_protocol_line_is_unpinned()`; `studies_delete_purge_only`: BEFORE DELETE → `study_delete_is_purge()`; `studies_mode_switch_unpeopled`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.participation_mode = 'anonymous' AND OLD.participation_mode IS DISTINCT FROM 'anonymous') → `studies_mode_switch_is_unpeopled()`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `study_waves`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `study_waves_identity_immutable`: BEFORE UPDATE → `study_waves_identity_is_immutable()`; `study_waves_parent_open`: BEFORE INSERT OR UPDATE OR DELETE → `study_waves_parent_is_open()`; `study_waves_version_own_line`: AFTER INSERT OR UPDATE OF protocol_version_id; FOR EACH ROW WHEN (NEW.protocol_version_id IS NOT NULL) → `study_wave_version_is_own_line()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `participants`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `participants_writable`: BEFORE INSERT OR UPDATE OR DELETE → `participants_are_writable()`; `participants_study_managed`: AFTER INSERT → `participants_study_is_managed()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `interview_sessions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `interview_sessions_writable`: BEFORE INSERT OR UPDATE OR DELETE → `interview_sessions_are_writable()`; `interview_sessions_link_own`: AFTER INSERT OR UPDATE OF link_id; FOR EACH ROW WHEN (NEW.link_id IS NOT NULL) → `interview_session_link_is_own()`; `interview_sessions_version_wave_pin`: AFTER INSERT → `interview_session_version_is_wave_pin()`; `interview_sessions_completion_snapshot`: AFTER INSERT OR UPDATE OF status; DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.status = 'completed') → `interview_session_completion_has_snapshot()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `interview_links`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `interview_links_writable`: BEFORE INSERT OR UPDATE OR DELETE → `interview_links_are_writable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `session_snapshots`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `session_snapshots_insert_frozen`: AFTER INSERT → `session_snapshots_insert_at_finalization()`; `session_snapshots_immutable`: BEFORE UPDATE OR DELETE → `session_snapshots_are_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nodes`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `nodes_parent_writable_insert`: AFTER INSERT; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `nodes_parent_writable_update`: AFTER UPDATE; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `nodes_parent_writable_delete`: AFTER DELETE; REFERENCING OLD TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `nodes_session_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.team_id IS DISTINCT FROM OLD.team_id) → `network_row_session_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `edges`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `edges_parent_writable_insert`: AFTER INSERT; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `edges_parent_writable_update`: AFTER UPDATE; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `edges_parent_writable_delete`: AFTER DELETE; REFERENCING OLD TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `edges_session_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.team_id IS DISTINCT FROM OLD.team_id) → `network_row_session_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `session_stats`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `session_stats_parent_writable_insert`: AFTER INSERT; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `session_stats_parent_writable_update`: AFTER UPDATE; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `session_stats_parent_writable_delete`: AFTER DELETE; REFERENCING OLD TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `session_stats_session_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.team_id IS DISTINCT FROM OLD.team_id) → `network_row_session_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `session_degree_hist`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `session_degree_hist_parent_writable_insert`: AFTER INSERT; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `session_degree_hist_parent_writable_update`: AFTER UPDATE; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `session_degree_hist_parent_writable_delete`: AFTER DELETE; REFERENCING OLD TABLE AS changed FOR EACH STATEMENT → `network_rows_parent_is_writable()`; `session_degree_hist_session_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.team_id IS DISTINCT FROM OLD.team_id) → `network_row_session_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `consent_documents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `consent_documents_publication_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( OLD.state <> 'draft' AND ( NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.version IS DISTINCT FROM OLD.version OR NEW.locale IS DISTINCT FROM OLD.locale OR NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.published_at IS DISTINCT FROM OLD.published_at -- Retirement is one-way: a superseded version does not become current -- again, or new participants could consent to it after its successor. OR ( OLD.retired_at IS NOT NULL AND ( NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.state IS DISTINCT FROM OLD.state ) ) ) ) → `consent_documents_publication_is_immutable()`; `consent_documents_delete_purge_only`: BEFORE DELETE → `consent_document_delete_is_purge()`                                                                                                                                                                                                                                                                                                     |
| `consent_items`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `consent_items_frozen`: BEFORE INSERT OR UPDATE OR DELETE → `consent_items_are_frozen_after_publication()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `participant_consents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `participant_consent_grant_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.participant_id IS DISTINCT FROM OLD.participant_id OR NEW.consent_document_id IS DISTINCT FROM OLD.consent_document_id OR NEW.consent_content_hash IS DISTINCT FROM OLD.consent_content_hash OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.method IS DISTINCT FROM OLD.method OR NEW.granted_at IS DISTINCT FROM OLD.granted_at OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at) ) → `participant_consent_grant_is_immutable()`; `participant_consents_session_own`: AFTER INSERT → `participant_consent_session_is_own()`; `participant_consents_document_published`: AFTER INSERT → `participant_consent_document_is_published()`; `participant_consents_required_items_affirmed`: AFTER INSERT; DEFERRABLE INITIALLY DEFERRED FOR EACH ROW → `participant_consent_required_items_are_affirmed()`; `participant_consents_delete_audited`: BEFORE DELETE → `participant_consent_delete_is_audited()` |
| `participant_consent_item_responses`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `participant_consent_item_responses_immutable`: BEFORE UPDATE → `participant_consent_grant_is_immutable()`; `participant_consent_item_responses_delete_audited`: BEFORE DELETE → `participant_consent_response_delete_is_audited()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `study_schedules`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `study_schedules_time_zone_known_insert`: AFTER INSERT; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `study_schedules_validate_time_zone()`; `study_schedules_time_zone_known_update`: AFTER UPDATE; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `study_schedules_validate_time_zone()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `schedule_occurrences`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `schedule_occurrences_time_zone_known_insert`: AFTER INSERT; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `schedule_occurrences_validate_time_zone()`; `schedule_occurrences_time_zone_known_update`: AFTER UPDATE; REFERENCING NEW TABLE AS changed FOR EACH STATEMENT → `schedule_occurrences_validate_time_zone()`; `schedule_occurrences_identity_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id OR NEW.participant_id IS DISTINCT FROM OLD.participant_id OR NEW.occurrence_index IS DISTINCT FROM OLD.occurrence_index OR NEW.scheduled_local_date IS DISTINCT FROM OLD.scheduled_local_date OR NEW.scheduled_local_minute IS DISTINCT FROM OLD.scheduled_local_minute OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `schedule_occurrence_identity_is_immutable()`                                                                                                                                                                                                                                               |
| `message_templates`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `message_templates_publication_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( OLD.state <> 'draft' AND ( -- Publication is one-way: a published template retires, it does not -- go back to draft to be reworded and republished under the same id, -- and a retired one is not revived for message_deliveries_template_applies -- to accept again. NEW.state = 'draft' OR (OLD.state = 'retired' AND NEW.state IS DISTINCT FROM 'retired') -- The scope is part of what a delivery cites: moved to another study, -- the template would no longer apply where its deliveries went. OR NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.locale IS DISTINCT FROM OLD.locale OR NEW.version IS DISTINCT FROM OLD.version ) ) → `message_templates_publication_is_immutable()`                                                                                                                                                                                                                                                                     |
| `message_deliveries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `message_delivery_payload_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.participant_id IS DISTINCT FROM OLD.participant_id OR NEW.occurrence_id IS DISTINCT FROM OLD.occurrence_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.recipient_address IS DISTINCT FROM OLD.recipient_address OR NEW.rendered_body_hash IS DISTINCT FROM OLD.rendered_body_hash OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `message_delivery_payload_is_immutable()`; `message_deliveries_template_applies`: AFTER INSERT → `message_delivery_template_applies()`; `message_deliveries_deletable`: BEFORE DELETE → `message_deliveries_are_deletable()`                                                                                                                                                                                                                                                                                                                                       |
| `message_delivery_events`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `message_delivery_events_immutable`: BEFORE UPDATE → `message_delivery_payload_is_immutable()`; `message_delivery_events_provider_sent_it`: AFTER INSERT → `message_delivery_event_provider_sent_it()`; `message_delivery_events_deletable`: BEFORE DELETE → `message_delivery_events_are_deletable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `api_tokens`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `api_token_authority_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.token_prefix IS DISTINCT FROM OLD.token_prefix OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.study_id IS DISTINCT FROM OLD.study_id OR NEW.access_level IS DISTINCT FROM OLD.access_level OR NEW.includes_pii IS DISTINCT FROM OLD.includes_pii OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at -- Revocation is evidence of who withdrew the token's authority and when, -- so both columns freeze together. Freezing only the timestamp would leave -- the accountable name rewritable on an already-revoked token, and -- api_tokens_revocation_check keeps the pair non-null, so it could be -- reassigned to anyone. OR ( OLD.revoked_at IS NOT NULL AND ( NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_by_user_id IS DISTINCT FROM OLD.revoked_by_user_id ) ) ) → `api_token_authority_is_immutable()`                                               |
| `template_versions`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `template_versions_immutable`: BEFORE UPDATE OR DELETE → `template_versions_are_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `template_version_sections`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `template_version_sections_immutable`: BEFORE UPDATE OR DELETE → `template_versions_are_immutable()`; `template_version_sections_insert_frozen`: BEFORE INSERT → `template_version_sections_pins_are_frozen()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `webhook_deliveries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `webhook_delivery_payload_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id OR NEW.webhook_id IS DISTINCT FROM OLD.webhook_id OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `webhook_delivery_payload_is_immutable()`; `webhook_deliveries_subscription_wants_event`: AFTER INSERT → `webhook_delivery_subscription_wants_event()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `experiment_assignments`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `experiment_assignments_immutable`: BEFORE UPDATE → `experiment_assignments_are_immutable()`; `experiment_assignments_deletable`: BEFORE DELETE → `experiment_assignments_are_deletable()`; `experiment_assignments_variant_known`: AFTER INSERT → `experiment_assignments_variant_is_known()`; `experiment_assignments_within_lifetime`: AFTER INSERT → `experiment_rows_are_within_lifetime()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `experiment_exposures`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `experiment_exposures_immutable`: BEFORE UPDATE → `experiment_assignments_are_immutable()`; `experiment_exposures_deletable`: BEFORE DELETE → `experiment_exposures_are_deletable()`; `experiment_exposures_within_lifetime`: AFTER INSERT → `experiment_rows_are_within_lifetime()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `experiments`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `experiments_variants_frozen`: BEFORE UPDATE; FOR EACH ROW WHEN (OLD.state <> 'draft' AND NEW.variants IS DISTINCT FROM OLD.variants) → `experiment_variants_are_frozen()`; `experiments_start_final`: BEFORE UPDATE; FOR EACH ROW WHEN ( OLD.started_at IS NOT NULL AND (NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.state = 'draft') ) → `experiment_start_is_final()`; `experiments_stop_closes_lifetime`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.stopped_at IS DISTINCT FROM OLD.stopped_at) → `experiment_stop_closes_the_lifetime()`; `experiments_variants_well_formed`: BEFORE INSERT OR UPDATE → `experiment_variants_are_well_formed()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `team_invitation_deliveries`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `invitation_delivery_payload_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.email IS DISTINCT FROM OLD.email OR NEW.role IS DISTINCT FROM OLD.role OR NEW.team_label IS DISTINCT FROM OLD.team_label OR NEW.inviter_label IS DISTINCT FROM OLD.inviter_label OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `invitation_delivery_payload_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `installation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `installation_setup_stays_closed`: BEFORE UPDATE; FOR EACH ROW WHEN ( current_user IN ('studio_app', 'studio_maintenance') AND ( (OLD.owner_user_id IS NOT NULL AND NEW.owner_user_id IS NULL) OR NEW.bootstrap_token_hash IS NOT NULL OR NEW.bootstrap_token_issued_at IS NOT NULL ) ) → `installation_setup_stays_closed()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `audit_events`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `audit_events_immutable`: BEFORE UPDATE OR DELETE → `audit_events_are_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `audit_export_jobs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `audit_export_request_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind OR NEW.actor_id IS DISTINCT FROM OLD.actor_id OR NEW.start_event_id IS DISTINCT FROM OLD.start_event_id OR NEW.start_event_sequence IS DISTINCT FROM OLD.start_event_sequence OR NEW.high_water_sequence IS DISTINCT FROM OLD.high_water_sequence OR NEW.filters IS DISTINCT FROM OLD.filters OR NEW.row_limit IS DISTINCT FROM OLD.row_limit OR NEW.byte_limit IS DISTINCT FROM OLD.byte_limit OR NEW.preflight_row_count IS DISTINCT FROM OLD.preflight_row_count OR NEW.preflight_byte_count IS DISTINCT FROM OLD.preflight_byte_count OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `audit_export_request_is_immutable()`; `audit_export_handle_single_use`: BEFORE UPDATE; FOR EACH ROW WHEN ( (OLD.handle_consumed_at IS NOT NULL AND NEW.handle_consumed_at IS DISTINCT FROM OLD.handle_consumed_at) OR (OLD.handle_hash IS NOT NULL AND NEW.handle_hash IS DISTINCT FROM OLD.handle_hash) ) → `audit_export_handle_is_single_use()`                                                                |
| `audit_alert_outbox`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `audit_alert_link_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN ( NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id OR NEW.audit_event_sequence IS DISTINCT FROM OLD.audit_event_sequence OR NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.event_version IS DISTINCT FROM OLD.event_version OR NEW.alert_policy_key IS DISTINCT FROM OLD.alert_policy_key OR NEW.created_at IS DISTINCT FROM OLD.created_at ) → `audit_alert_link_is_immutable()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `study_role_grants` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Grants SELECT, INSERT, UPDATE, DELETE to studio_app, studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `message_deliveries` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Revokes UPDATE from studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `message_delivery_events` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Revokes UPDATE from studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `api_tokens` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Grants SELECT, INSERT, UPDATE, DELETE to studio_app, studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `webhook_deliveries` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Revokes UPDATE, DELETE from studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `feedback_reports` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Grants SELECT, INSERT, UPDATE, DELETE to studio_app, studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `team_invitation_deliveries` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Grants SELECT, INSERT, UPDATE, DELETE to studio_app, studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `team_invitation_deliveries` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Revokes UPDATE, DELETE from studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `installation` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Revokes INSERT, DELETE, TRUNCATE from studio_app, studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `installation` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Revokes UPDATE from studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `audit_export_jobs` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Revokes UPDATE, DELETE from studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `audit_alert_outbox` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Revokes UPDATE, DELETE from studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `audit_export_jobs` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Grants UPDATE (handle_consumed_at) to studio_app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `audit_events` privileges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Revokes UPDATE, DELETE, TRUNCATE from studio_app, studio_maintenance.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

<!-- generated:schema-docs end -->

The server never applies schema — it only verifies. Application is
`drizzle-kit push`, run programmatically by `apply-schema` and `db:reset` from
a repo checkout: it introspects the live database, applies whatever delta
brings it to the definitions, re-runs the sidecars, and stamps a fingerprint —
the hash of the DDL that describes this build. Boot compares that stamp
against the fingerprint committed in `server/src/db/fingerprint.generated.ts`.
Both database commands resync the fingerprint and generated schema docs before
touching the database. To resync without connecting to a database, run:

```bash
pnpm --filter @codaco/studio-server sync-fingerprint
```

That command also regenerates the ERD, its sidecar summary, and the README
section above. `generate:erd` is available when only the documentation artifact
needs refreshing. CI re-runs the generator and rejects either committed
artifact once it has drifted, which you can do yourself with:

```bash
pnpm --filter @codaco/studio-server check:schema-docs
```

It is a check of its own rather than a test case because rendering the diagram
needs no database, and a per-test budget shared with the suites that do is the
wrong bound for it. The test suite still holds the section to the current
fingerprint and to naming every sidecar, both read from the committed files.

A mismatch stops the server with the remedies: `apply-schema` reconciles the
database in place, or

```bash
pnpm --filter @codaco/studio-server db:reset
```

drops the schema, rebuilds it, and seeds. It refuses to touch a non-loopback
database unless you pass `--force`. It reads `.env` first and adds the
committed development defaults only when the target is local, so a forced
reset of a managed database never picks up the development marker. It also
sweeps up any `studio_test_*` schemas and databases an interrupted test run
left behind.

A database carrying the tables but no fingerprint is refused rather than
adopted by boot — the SQL that built it is unknown — and `db:reset` (or a
deliberate `apply-schema`, which reconciles whatever it finds) is the remedy.

A database built by the versioned migration system this repository used to
carry — recognisable by a `studio_migrations` schema — is not one
`apply-schema` can reconcile. It would stamp the current fingerprint and leave
the migration schema, and the roles and grants that came with it, standing
behind it, so `db:reset` is the remedy. Only developer databases can be in
that state, because that system was never deployed.

The fingerprint compares the database against the DDL this build renders. It
cannot tell you that a `better-auth` upgrade expects a shape these definitions
no longer describe — the regeneration procedure in `auth-schema.ts` remains
the only control for that.

### Protocol storage

Protocols are not stored as documents. Each stage, each codebook entity, the
settings block and the stage order is an immutable, individually validated
section document identified by its content hash, and a draft or a published
version is a _manifest_ — an ordered map of section id to section hash
(#1276). Editing a section writes a new section and a new manifest; unchanged
sections are shared, reordering stages touches only the manifest, and
structural diff falls out of comparing two manifests.

`server/src/protocol` implements this over the same pool everything else uses.
Assembly (`getDraftDocument`, `getVersionDocument`) is the contract: outside
the storage layer,
Studio consumes the schema-conformant protocol document exactly as
`@codaco/protocol-validation` defines it, and publishing re-validates the
assembled document with the canonical validator before freezing it. Sectioning
is Studio-internal storage topology, not a protocol-schema change.

### Tenancy

Teams (#1249) are the tenant boundary. Every domain row — from protocols,
sections and drafts to studies, participants, interview sessions and the
collected network — carries a denormalized `team_id`, pinned to its parent
through composite foreign keys (`(study_id, team_id)`, and
`(wave_id, study_id, team_id)` where a child must also prove it belongs to the
same study as its siblings), and section
documents deduplicate **per team**: identical content in two teams is two rows,
because a shared row would leak content across the boundary. The data layer
only speaks through a `TenantDb` (`@codaco/studio-sync/tenant`), a pool handle
pinned to one team: the `ProtocolStore` and `SyncServer` constructors take one
instead of a pool, every statement carries an explicit team predicate, and
every statement runs inside a transaction that stamps `app.team_id` as a
transaction-local GUC. A team's id enters a request explicitly — `requireTeam`
in `server/src/rpc.ts` resolves the procedure input's `teamId` against the
caller's membership (`AuthService.getMembership`) and yields the pinned
`TenantDb`; the session's active team is never the authorization input.

Beneath that, Postgres row-level security enforces the same boundary
(`@codaco/studio-sync/rls`). Every tenant table carries a `team_isolation`
policy — a row is visible, and may be written, only when its `team_id` equals
the stamped GUC — so a statement that forgets its predicate returns nothing
rather than another team's rows, and a write aimed at another team is refused.
Row-level security is _forced_, so the table owner is not exempt; a superuser
always is, which is why the server never runs as the connecting login.
`createPool` starts every session as `studio_app`, a `NOLOGIN` role with
neither `SUPERUSER` nor `BYPASSRLS`, which the schema apply creates and grants
the login the right to assume (`role=` is a startup parameter: a missing role
refuses the connection, and `RESET ROLE` returns to it). That holds in
development too, where the login is the container's superuser. Garbage
collection is the one deliberately cross-team caller: it runs on a
`studio_maintenance` pool — the one role the policies admit across every
team, a policy clause rather than a `BYPASSRLS` role because only a superuser
can create one of those and managed Postgres offers none — enumerates tenants
from the swept tables, sweeps each under that team's `TenantDb`, and refuses
any other role, under which it would report a clean sweep without having
visited anyone. Every background job runs that way: the worker process
(see [Background work](#background-work)) runs protocol-store garbage
collection, which pg-boss's cron starts hourly, and invitation and sign-in
mail, all as `studio_maintenance`. The application role may create a job and
nothing else with it — INSERT on the job table, SELECT on the queue and version
tables, and a column-level SELECT on the two columns its insert reads back — so
queued work is invisible to the role that serves requests, and one team cannot
learn what another has queued. Job payloads carry row identifiers only; the
handler loads what it needs under its own role. There is one documented
exception, declared where the policy is (`JOB_PAYLOAD_POLICY` in
`packages/studio-sync/src/jobs.ts`, where a test refuses any other): a sign-in
email carries the address and the one-time link, because better-auth stores the
token hashed and mints the link during the request, so there is no row for the
handler to load it back from. Two tables beside the audit log —
`audit_export_jobs` and `audit_alert_outbox` — carry the ordinary policy rather
than the audit log's stricter `audit_team_isolation` (which admits no
maintenance role at all), because the jobs that will drain them run across
teams; they hold ids, event types and counters, never event content. A second
transaction-scoped marker, `app.erasing_participant_id`, authorizes participant
erasure: the guards on
participant data accept an application-role delete only when the marker names
the row's own participant, so a bug cannot delete anyone else's data and a
finalized session can be deleted only by that path or by the maintenance
purge. The better-auth tables carry no policy: better-auth and
`AuthService.getMembership` run on the application pool without team context.
Two consequences are worth knowing. `COPY FROM` is refused for any role
subject to row-level security, so a bulk import must batch `INSERT`s or run as
maintenance. And the test suites run the store and the sync engine as
`studio_app`, so every existing case also proves the policies admit what they
should; `server/src/db/__tests__/rls.test.ts` proves what they refuse.

Better-auth's organization plugin backs these tables, and its own optional
`teams` feature — a subdivision _inside_ an organization — stays disabled, so
"team" has exactly one meaning in this schema.

Live editing within a section is not here — that is the sync engine's lease and
commit path in `@codaco/studio-sync`. The store owns what sync deliberately
refuses: creation, structural add and remove, publishing, versions, diff,
platform migration, and garbage collection.

Its database-backed tests run against the dev Postgres and skip without one, so
on a machine with no container `pnpm --filter @codaco/studio-server test`
passes having verified far less than it appears to. Read the reporter, not the
exit code.

The store's RPC surface is minimal — `protocols.create` and `protocols.list`
exist to prove the tenancy spine end to end, and no screen renders them yet —
so

```bash
pnpm --filter @codaco/studio-server protocol-demo
```

remains the way to look at one. It sectionizes a protocol (the sample one, or
`--protocol <path>`), prints its sections and their hashes (`--sections` for
every row), assembles it back, publishes it, edits one prompt and publishes
again to show how much of the second version is structurally shared with the
first, and renders the structural diff as sentences. It asserts nothing — the
suites in `server/src/protocol/__tests__` own that — and it should be deleted
once the client can show the same things. The rows it writes stay behind for
inspection; published versions cannot be deleted, so `db:reset` is how you clear
them.

### Secrets at rest

Studio encrypts **secrets** in the application and relies on the deployment for
everything else (#1900). A secret is a value that would let someone act as
Studio or as a researcher's integration, and there are three:

| What                             | Where it is stored                                 | Opened where                                      |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Webhook signing secrets          | `webhook_subscriptions.secret_ciphertext`          | In the worker, to sign one delivery               |
| API-key protocol assets          | `protocol_asset_keys`, never in a section document | Assembling a protocol for a session or a preview  |
| OAuth access, refresh, id tokens | `account`, as `studio-secret:<keyId>:<base64url>`  | Inside the auth adapter, on every read of the row |

AES-256-GCM through Node's own `crypto`, one keyring (see
[Secrets](#secrets) for the variables), one HKDF-derived subkey per purpose,
and a key id stored beside every ciphertext. The row's identity is the
additional authenticated data — team and subscription, team and protocol and
asset, provider and account and column — so a ciphertext moved to another row
stops opening rather than decrypting as that row's secret. There is no general
`encrypt`/`decrypt`: a caller names the kind of secret it is handling, and
therefore names the row it belongs to. Both processes refuse to start when a
key id in the database is not in the keyring, naming it, and
`studio-api rotate-secrets` re-seals every row under the current entry (see
[Production](#production)).

What is **not** encrypted in the application, and what protects it instead:

- **Participant contact details, names and attributes** are ordinary columns
  with ordinary indexes. Ruled on 2026-09-14: encrypting contact details does
  not matter while response data is not encrypted, and the decision can change
  later — the keyring, envelope, boot check and rotation command are the
  mechanism that would do it, with a new purpose subkey and a blind index for
  equality lookups.
- **Interview responses and collected networks** are not encrypted in the
  application either (ruled 2026-09-04). They are the bulk of what Studio
  holds, and encrypting them would end query, export and projection.
- Both are protected by **encrypted storage volumes for Postgres and the
  object store, encrypted backup files, TLS to the database, and access
  control** — requirements this aspect states and the deployment (#1909) and
  backup (#1901, #1910) aspects carry.

The keyring is backed up **with the database**, and the two must match: a
database restored beside a keyring that cannot produce its key ids is refused
at boot rather than served half-readable. Losing the keyring loses every
stored secret — each researcher re-enters an API key, re-links an OAuth
account, and a webhook endpoint is given a new signing secret — and nothing
else: no study, participant, session or network depends on it.

None of this is the interview runtime's **participant passphrase**, which is a
separate, participant-held, zero-knowledge feature: Studio stores what it
produces as opaque bytes and has no key for it. It is untouched by any of the
above.

`src/secrets/exclusion.ts` states, at the top of the file, the values that
must never leave the process at all — participant information, API-key asset
values, secrets — and enforces the asset-key half today, where an assembled
protocol document leaves the store. The logging, tracing, metrics and
analytics half is #1897.

### Background work

Everything Studio does outside a request is a job on a queue, and a second
process runs it (#1895). One image, two processes: `node dist/index.js` is the
web process, which serves HTTP, the RPC surface and the WebSocket endpoint and
may only create jobs, and `node dist/worker.js` is the worker, which runs the
jobs and the cron schedules and binds no port. Neither can do the other's work
— the web process constructs pg-boss with supervision, scheduling and migration
off, and the worker imports neither the HTTP app nor the RPC router, which a
source test holds it to. `pnpm dev` runs both.

A job is created inside the transaction that caused it. The command hands its
own database client to pg-boss through pg-boss's Drizzle adapter, so the job is
inserted on that connection, inside that transaction, alongside the domain row
and its audit event: a command that rolls back leaves no job, and a command
that commits always leaves exactly one. Nothing enqueues after a commit, and
`server/src/jobs/enqueue.ts` is the only module that creates a job at all —
another source test holds the codebase to that, because an enqueue on its own
connection reopens both windows this closes.

Queues are schema rather than configuration. A queue is declared in
`JOB_QUEUES` in `packages/studio-sync/src/jobs.ts` — after any queue it names
as its dead letter, because the target has to exist before the queue that
points at it — and `pnpm --filter @codaco/studio-server sync-fingerprint` then
folds it into the fingerprint every process verifies at boot. `apply-schema`
creates or updates it (see [Changing the schema](#changing-the-schema)).
Nothing creates a queue at run time. What each database role may do with the
job tables is in [Tenancy](#tenancy).

| Queue                             | What runs on it                                                  | Retries                                            | Attempt expiry | When attempts run out                             |
| --------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | -------------- | ------------------------------------------------- |
| `invitation-delivery`             | Team-invitation email                                            | 7 (eight attempts), exponential from 5 s to 30 min | 60 s           | Copied to `invitation-delivery-dead-letter`       |
| `invitation-delivery-dead-letter` | Nothing works it; it holds what failed                           | none                                               | —              | Kept 30 days for a manual re-send (#1307)         |
| `sign-in-email`                   | Magic-link sign-in email                                         | 2, exponential from 5 s to 60 s                    | 30 s           | Dropped; an expired sign-in link is worth nothing |
| `protocol-store-gc`               | The protocol-store sweep, hourly, at most one at a time          | none                                               | 1 h            | Nothing; the next hour's run does the same work   |
| `denied-attempts-summary`         | The suppressed-denial sweep, every minute, at most one at a time | none                                               | 60 s           | Nothing; the next minute's run does the same work |

A worker with no mail transport still boots. It registers the cron and works
the sweep, logs at error level that `invitation-delivery` and `sign-in-email`
are going unworked, and the mail waits: an invitation created while no worker
has SMTP is queued and sent when one arrives, rather than refused (the ruling
recorded on #1895 — queue it; it sends when a worker returns). `SMTP_URL` and
`EMAIL_FROM` therefore belong in the worker's environment; the web process does
not read them.

Each job outcome is one log line naming the queue, the job id and the attempt.
Two of them are at error level, because nothing will retry either: a final
failure, and `uncertain` — the send may have happened and Studio could not
record that it did, so a person decides rather than a retry duplicating
someone's mail (#1305, #1307).

On SIGTERM the worker stops pg-boss gracefully with a 25-second timeout, so a
send already in flight finishes inside the container's stop window. A job that
outlives it fails and is retried by the next worker.

What is deliberately absent: there is no admin surface, no dashboard, and no
job priorities. A delivery state researchers can see, and a manual re-send, is
#1307; structured logging, metrics, and whether to mount pg-boss's own
dashboard belong to the observability aspect of #1243.

## Environment

`apps/studio/server/src/env.ts` is the only module in the server that reads
`process.env` — the repo-wide oxlint `no-process-env` rule enforces that, and
everything else takes a resolved `StudioEnv`. It validates in two layers:
`src/env/variables.ts` declares a schema per variable, and `src/env/resolve.ts`
applies the rules that span several at once (all-or-nothing `S3_*`, the
`SMTP_URL`/`EMAIL_FROM` pairing, the mail transport's three-way resolution).
Those two mail variables are read only by the process that sends mail — the
worker (see [Background work](#background-work)) — and withheld from every
other read, so the web process cannot construct a transport even where a
deployment defines them, and a half-configured pair is the worker's to refuse.

Three files carry values, and the dev script loads them in this order, so a
later one wins:

| File                      | Committed          | Loaded by                   |
| ------------------------- | ------------------ | --------------------------- |
| `server/.env.development` | yes — deliberately | `pnpm dev` only             |
| `server/.env`             | no, gitignored     | `pnpm dev` and `pnpm start` |
| `server/.env.example`     | yes, as a template | nothing; copy it to `.env`  |

**Development needs no setup.** `.env.development` is committed, so a fresh
clone runs `pnpm --filter @codaco/studio-server dev` and gets a working stack
— its credentials are intentional test values pointing at the Docker
containers the dev script provisions. Put personal overrides (real SMTP
credentials, say) in a gitignored `.env` beside it.

Both files yield to the surrounding environment — Node's env-file loader never
overwrites a variable that is already set — so an exported value beats either
of them.

No deployment path loads `.env.development`: the images never copy it, a
deployment supplies variables to the container instead, and `pnpm start` reads
only `.env`. That is what makes it safe to key the development conveniences —
the console mailer, and tolerating an unpaired `EMAIL_FROM` — to the
`STUDIO_DEV_DEFAULTS` marker that file sets.

Two rules keep that marker honest, because it licenses a publicly-known
signing secret, a mailer that prints sign-in links, and a boot that applies
the schema to whatever `DATABASE_URL` names:

- It is refused unless `NODE_ENV` is `development` or `test`, so forgetting
  `NODE_ENV=production` cannot downgrade a deployment to development
  behaviour.
- It is refused unless `DATABASE_URL` points at this machine. An exported
  `DATABASE_URL` outranks the committed file, so otherwise the development
  lane could quietly aim all of the above at someone's real database.

To work against a remote database, leave the lane for that process rather than
editing the committed file: `STUDIO_DEV_DEFAULTS= pnpm ...`.

Because the schema carries no defaults, no development credential is compiled
into the server bundle.

The table below, `.env.development`, and `.env.example` are all generated from
`src/env/catalogue.ts` by
`pnpm --filter @codaco/studio-server generate:env-docs`. A vitest guard fails
if any of them drifts from it, and a variable added without a catalogue entry
fails `pnpm typecheck`.

<!-- generated:env start -->

<!-- Generated by `pnpm --filter @codaco/studio-server generate:env-docs` from src/env/catalogue.ts. Do not edit by hand. -->

### Process

| Variable                 | What it is                                                                                                                                                                    | Development default | Real deployment                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`               | Runtime mode. Anything other than `production` leaves development affordances available.                                                                                      | `development`       | Set to `production` by the `studio-api` image.                                                                                                                                                                                                                     |
| `STUDIO_DEV_DEFAULTS`    | Marks the process as running against the committed development defaults.                                                                                                      | `1`                 | Never set. It is refused at boot unless `NODE_ENV` is `development` or `test`.                                                                                                                                                                                     |
| `PORT`                   | TCP port the HTTP server listens on.                                                                                                                                          | —                   | Unset ⇒ 3000.                                                                                                                                                                                                                                                      |
| `HOST`                   | Interface the HTTP server binds to.                                                                                                                                           | —                   | Unset ⇒ `0.0.0.0`.                                                                                                                                                                                                                                                 |
| `WORKER_HEALTH_PORT`     | TCP port the worker process serves `/healthz` and `/readyz` on, bound to `127.0.0.1` only.                                                                                    | —                   | Unset ⇒ 3001. The worker routes no traffic, so this listener exists for the container healthcheck and is never published or proxied; the address it binds is fixed in code, not configurable. The web process ignores it and serves the same two routes on `PORT`. |
| `STUDIO_TELEMETRY`       | Whether this instance reports anonymous usage telemetry. Declared here so the development lane can turn it off; nothing reads it until #1897 builds the reporting it governs. | `false`             | Unset ⇒ true. Set to `false` to opt an instance out. It does not govern the update check (#1901), which is not configurable and is blocked at the firewall instead.                                                                                                |
| `STUDIO_DEPLOYMENT_MODE` | Which topology this deployment serves: `managed` (marketing, pricing, sign-up, billing) or `self-hosted` (first-run setup). The other topology’s paths are refused with 404.  | `managed`           | Unset ⇒ `self-hosted`. The managed deployment sets `managed` in the container environment, at run time rather than at build time, because every entrypoint reads it inside the running process.                                                                    |

### Object storage

| Variable               | What it is                                                    | Development default                                                | Real deployment                                |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| `S3_ENDPOINT`          | S3-compatible endpoint holding content-addressed asset bytes. | `http://localhost:9100`                                            | Required with the other four `S3_*` variables. |
| `S3_REGION`            | Region passed to the S3 client.                               | `garage`                                                           | Required with the other four `S3_*` variables. |
| `S3_BUCKET`            | Bucket asset objects are written to and read from.            | `studio-dev`                                                       | Required with the other four `S3_*` variables. |
| `S3_ACCESS_KEY_ID`     | Access key for the object store.                              | `GK000000000000000073646576`                                       | Required with the other four `S3_*` variables. |
| `S3_SECRET_ACCESS_KEY` | Secret key for the object store.                              | `0000000000000000000000000073747564696f2d6465762d6e6f742d70726f64` | Required with the other four `S3_*` variables. |

### Database

| Variable                 | What it is                                                                          | Development default                                    | Real deployment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Postgres connection string, `pg.Pool`’s native format.                              | `postgres://postgres:spike@127.0.0.1:54318/studio_dev` | Unset ⇒ no database; auth and sync refuse while the server still boots. The login owns the schema and needs `CREATEROLE` the first time `apply-schema` runs; the server runs as the `studio_app` role it creates. A connection string carrying an `options` parameter is refused at boot: node-postgres would let it override the `role=` every pool pins itself with, and both processes would run as the login instead.                                                                            |
| `DATABASE_PASSWORD_FILE` | Path of a file holding the password for `DATABASE_URL`, which must then carry none. | —                                                      | How the reference compose stack delivers the database password: a Compose file secret at `/run/secrets/postgres_password`, so it appears neither in `docker inspect` nor in any process environment. The file is read once at boot and its password inserted into `DATABASE_URL`. Setting it while `DATABASE_URL` also carries a password is a boot error — there would be no way to tell which was meant. Trailing newlines are stripped, matching what the Postgres image does with the same file. |

### Secrets

| Variable                  | What it is                                                                                                                                                                                                                                                          | Development default                                | Real deployment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDIO_SECRETS_KEY`      | The keyring Studio encrypts stored secrets with — webhook signing secrets, API-key protocol assets and OAuth tokens. One or more `<id>:<base64 of 32 bytes>` entries separated by commas or whitespace, the first of which is the one new values are written under. | `dev:c3R1ZGlvLWRldi1rZXlyaW5nLW5vdC1mb3ItcHJvZCE=` | Required whenever `DATABASE_URL` is set, unless `STUDIO_SECRETS_KEY_FILE` names a file holding it; setting both is refused at boot. Generate an entry with `openssl rand -base64 32` and write it as `k1:<value>`. Back it up with the database: without it every stored secret is unreadable, and the server refuses to start rather than serve a database it can only half read. Rotate by adding a new entry at the front, deploying, running `studio-api rotate-secrets`, and then removing the old entry. |
| `STUDIO_SECRETS_KEY_FILE` | Path to a file holding the keyring, read once at boot; the file may put one entry per line.                                                                                                                                                                         | —                                                  | The reference stack mounts the keyring as a Compose file secret under `/run/secrets`, so it never appears in `docker inspect` or in a log of the environment. Takes the place of `STUDIO_SECRETS_KEY`, which stays for development and for hosts that have no file secrets; setting both is refused at boot.                                                                                                                                                                                                   |

### Authentication

| Variable                     | What it is                                                                                                    | Development default                    | Real deployment                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`         | Signing secret for sessions and magic-link tokens.                                                            | `studio-dev-secret-not-for-production` | Required whenever `DATABASE_URL` is set. Generate one with `openssl rand -base64 32`.                                                                                                                                                                                                                            |
| `PUBLIC_URL`                 | The browser-facing origin. Cookies, magic-link URLs, and team-invitation URLs are minted against it.          | `http://localhost:5173`                | Required whenever `DATABASE_URL` is set.                                                                                                                                                                                                                                                                         |
| `SMTP_URL`                   | SMTP transport sign-in and team-invitation email is sent through.                                             | `smtp://127.0.0.1:1025`                | Read by the worker process, which sends every message Studio sends; the web process never reads it. Unset ⇒ the worker boots without its mail workers and says so, and sign-in and invitation mail queues until one is configured. A sign-in or invitation link is never written to the log outside development. |
| `EMAIL_FROM`                 | From address on sign-in and team-invitation email.                                                            | `studio-dev@localhost`                 | Read by the worker process alongside `SMTP_URL`: required with it, and refused without it.                                                                                                                                                                                                                       |
| `GOOGLE_CLIENT_ID`           | OAuth client ID for "Continue with Google" sign-in (#1255).                                                   | —                                      | Required with `GOOGLE_CLIENT_SECRET`; unset ⇒ Google sign-in is not offered. Create a Web application OAuth client in the Google Cloud Console with `<PUBLIC_URL>/api/auth/callback/google` as an authorized redirect URI.                                                                                       |
| `GOOGLE_CLIENT_SECRET`       | OAuth client secret paired with `GOOGLE_CLIENT_ID`.                                                           | —                                      | Required with `GOOGLE_CLIENT_ID`, and refused without it.                                                                                                                                                                                                                                                        |
| `MICROSOFT_CLIENT_ID`        | Entra application (client) ID for "Continue with Microsoft" sign-in (#1255).                                  | —                                      | Required with `MICROSOFT_CLIENT_SECRET`; unset ⇒ Microsoft sign-in is not offered. Register an application in Microsoft Entra with `<PUBLIC_URL>/api/auth/callback/microsoft` as a Web redirect URI.                                                                                                             |
| `MICROSOFT_CLIENT_SECRET`    | Client secret paired with `MICROSOFT_CLIENT_ID`.                                                              | —                                      | Required with `MICROSOFT_CLIENT_ID`, and refused without it.                                                                                                                                                                                                                                                     |
| `MICROSOFT_TENANT_ID`        | Entra tenant to accept sign-ins from, for single-tenant registrations.                                        | —                                      | Unset ⇒ `common` (any organizational or personal Microsoft account, matching a multitenant registration). Refused without the other two `MICROSOFT_*` variables.                                                                                                                                                 |
| `STUDIO_SEED_ADMIN_PASSWORD` | Password of the `admin@studio.test` account the `seed` command creates, which owns every seeded team.         | —                                      | Read only by `seed` and `db:reset`. Required to seed a non-local database: the published development password is refused there, because it is a working credential on any instance that keeps it. Unset ⇒ the development password, for local databases only.                                                    |
| `TRUSTED_PROXIES`            | Comma-separated proxy addresses or CIDRs whose `X-Forwarded-For` may be trusted when resolving the client IP. | —                                      | Unset ⇒ forwarded headers are not read at all, which is safe but shares one rate-limit bucket across every client. List only your own proxies, and only where each one overwrites the header rather than appending to a client-supplied value.                                                                   |

### Rate limiting

| Variable                                | What it is                                                                                                     | Development default       | Real deployment                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                             | Redis 7-compatible server (the reference stack runs Valkey) holding every rate-limit counter.                  | `redis://127.0.0.1:63790` | Unset ⇒ there is no limiter store, every limit below is disabled, and the server says so once at boot outside development. The reference compose stack always sets it. Any Redis 7-compatible server will do — the limiter uses `EVAL`, sorted sets and hashes and nothing else — and the counters are disposable: losing them resets every window rather than losing data. |
| `RATE_LIMIT_SIGN_IN_ADDRESS`            | Sign-in and magic-link requests per client address, as `count/window`.                                         | `100000/1m`               | Unset ⇒ `10/10m`. Ten attempts from one address in ten minutes covers a shared institutional address whose users mistype passwords, and makes credential stuffing from a single host pointless.                                                                                                                                                                             |
| `RATE_LIMIT_SIGN_IN_EMAIL`              | Sign-in and magic-link requests per email address.                                                             | `100000/1m`               | Unset ⇒ `5/10m`. An account belongs to one person, and a person who has failed five times in ten minutes needs the reset link rather than a sixth attempt. This is the limit an attacker spreading attempts across addresses meets.                                                                                                                                         |
| `RATE_LIMIT_INVITATION_ACCEPT`          | Team-invitation acceptances per invitation token.                                                              | `100000/1m`               | Unset ⇒ `10/10m`. An invitation is accepted once; ten allows a reload, a wrong account, and a sign-in in between, and stops a token being brute-forced through one link.                                                                                                                                                                                                    |
| `RATE_LIMIT_PARTICIPANT_REDEEM_ADDRESS` | Participation-link redemptions per client address.                                                             | `100000/1m`               | Unset ⇒ `20/10m`. A lab runs several interviews from one address, so this is deliberately loose; the per-link limit below is what protects a single link. Declared now and enforced when the participant routes land (#1899).                                                                                                                                               |
| `RATE_LIMIT_PARTICIPANT_REDEEM_LINK`    | Participation-link redemptions per link.                                                                       | `100000/1m`               | Unset ⇒ `5/10m`. A link is redeemed once, so five covers a reload and a lost response while making a link identifier not worth guessing. Declared now and enforced when the participant routes land (#1899).                                                                                                                                                                |
| `RATE_LIMIT_PARTICIPANT_SYNC`           | Interview sync writes per participant session.                                                                 | `100000/1m`               | Unset ⇒ `600/1m`. Ten writes a second is far above what answering questions produces and far below what a script replaying a session could. Declared now and enforced when the participant routes land (#1899).                                                                                                                                                             |
| `RATE_LIMIT_RPC_USER`                   | Internal RPC calls per signed-in user.                                                                         | `100000/1m`               | Unset ⇒ `600/1m`. The app issues a burst of calls per screen, so the limit is a ceiling on a runaway client rather than a budget a person can feel: ten calls a second sustained is more than any screen needs.                                                                                                                                                             |
| `RATE_LIMIT_RPC_TEAM`                   | Internal RPC calls per team, across everyone in it.                                                            | `100000/1m`               | Unset ⇒ `3000/1m`. A team is many researchers working at once, so this protects the instance rather than the person: it is five times the per-user limit, which one runaway client cannot reach alone.                                                                                                                                                                      |
| `RATE_LIMIT_STORAGE_READ`               | Reads from `/storage`, per participant session where the request carries one and otherwise per client address. | `100000/1m`               | Unset ⇒ `2000/5m`. Generous by design: an interview fetches every stimulus it shows, and an institution often puts a whole building behind one address. Keyed per client address until the participant session token exists (#1899).                                                                                                                                        |
| `RATE_LIMIT_PUBLIC_API`                 | Calls to `/api/v1`, per API token where the request carries one and otherwise per client address.              | `100000/1m`               | Unset ⇒ `300/1m`. Five calls a second suits an analysis script paging through results and leaves the instance responsive to everyone else.                                                                                                                                                                                                                                  |
| `RATE_LIMIT_WS_UPGRADE`                 | WebSocket upgrades per signed-in user.                                                                         | `100000/1m`               | Unset ⇒ `30/1m`. A tab opens one socket and reopens it when the network drops, so thirty a minute absorbs a flapping connection while stopping a reconnect loop from becoming a connection storm.                                                                                                                                                                           |

<!-- generated:env end -->

## Production

Nothing below is run by hand in a deployment: `apps/studio/docker-compose.yml`
is the reference stack both topologies run, and it is what names these
commands, wires the health checks and mounts the secrets. See
[Deployment topologies](#deployment-topologies) and
[the self-host guide](./docs/self-host/README.md). This section is the contract
that file depends on.

Two images, built from one Dockerfile at the monorepo root (#1909):

```bash
docker build -f apps/studio/Dockerfile --target studio-api -t studio-api .
docker build -f apps/studio/Dockerfile --target studio-web -t studio-web .
```

`studio-api` carries the server bundle. Its entrypoint dispatches on the first
argument, so one image runs every Studio process and a deployment names a
command rather than a path into the bundle:

| Command                  | What it is                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `serve` (the default)    | HTTP, the RPC surface and the WebSocket endpoint; a single replica (#1247)                  |
| `worker`                 | background jobs and cron schedules; scalable (see [Background work](#background-work))      |
| `migrate`                | creates this build's schema in an empty database; once per deployment, not once per replica |
| `maintenance on` / `off` | closes the instance to users. A stub that exits 64 until #1901 merges                       |
| `rotate-secrets`         | re-encrypts every stored secret under the keyring's current entry; once per rotation        |

```bash
docker run --rm --env-file .env studio-api migrate
docker run --rm --env-file .env -p 3000:3000 studio-api serve
docker run --rm --env-file .env studio-api worker
```

`studio-web` is nginx serving the built client and the maintenance page
(`apps/studio/client/nginx.conf`). It proxies nothing: Traefik routes the API's
paths to `studio-api` and everything else to it, so the browser sees one
origin. Since #1909 the server holds no client assets at all — it serves no
page path in any topology, and the topology gate that used to live beside the
static mount is now the client's alone (`client/src/lib/deployment.ts`).

Both halves also run straight from a checkout, which is what the suites and a
local smoke test use:

```bash
pnpm --filter @codaco/studio-client build        # client/dist — static assets
pnpm --filter @codaco/studio-server build        # server/dist — Node bundle
pnpm --filter @codaco/studio-server start        # the web process
pnpm --filter @codaco/studio-server start:worker # the background worker
pnpm --filter @codaco/studio-server start:migrate # the schema one-shot
```

### Health checks

There is no `HEALTHCHECK` in the image, deliberately: the entrypoint decides
which process runs, and a check that suited `serve` would be wrong for `worker`
and meaningless for `migrate`. The check belongs to the service, and this is
the contract each process offers.

| Process  | Check                                           | What it means                                                                                                           |
| -------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `serve`  | `GET /healthz` on `PORT`                        | Liveness. It consults nothing, so a container runtime does not restart a healthy process because Postgres is down       |
| `worker` | `GET /readyz` on `127.0.0.1:WORKER_HEALTH_PORT` | Readiness, including the pg-boss connection — the one thing a process that answers no request cannot otherwise be asked |

Both processes serve both routes. `/readyz` runs each of the process's checks
under a one-second bound and answers with the verdict per check:

```json
{ "status": "ok", "checks": { "db": "ok", "schema": "ok", "jobs": "ok" } }
```

`status` is `ok`, `degraded` or `failing`, and only `failing` answers 503 — a
degraded process still serves. The web process checks its application pool, the
schema fingerprint, and the object store where one is configured; the worker
checks its maintenance pool, the schema, and whether pg-boss is connected. A
surface this deployment has not configured is left out rather than reported
failed: it refuses by design, and a check for it would make an instance that
never wanted one permanently unready.

The worker's listener binds `127.0.0.1` and nothing else. It is not a service
anything routes to, and `WORKER_HEALTH_PORT` (default 3001) exists so the
healthcheck can name a port — not so the listener can be published.

### Rotating the keyring

`rotate-secrets` re-encrypts every stored secret under the keyring's current
entry, and is what makes a key rotation safe (see [Secrets](#secrets) for the
keyring itself). It runs to completion and exits, under the maintenance role,
so it needs the same `DATABASE_URL` and keyring the processes do:

```bash
docker run --rm --env-file .env studio-api rotate-secrets   # a deployment
pnpm --filter @codaco/studio-server rotate-secrets          # a checkout
```

In the reference stack that is `docker compose run --rm --no-deps api
rotate-secrets`. Rotating is three steps: add a new entry at the FRONT of the
keyring and deploy, so new values are written under it and the old one can
still be read; run the command, which re-seals every row whose key id is not
the current one, in batches, and reports success only once it has counted that
no row is left under another key; then remove the old entry and deploy again.
Both processes refuse to start while any stored key id is missing from the
keyring, naming it, so a half-finished rotation is caught before it serves
anything.

### Database schema and seeding

Run **once per deployment** against `DATABASE_URL` — not once per replica,
which is why these are commands rather than boot work. A deployment runs
`migrate` from the image; a checkout runs `apply-schema`:

```bash
docker run --rm --env-file .env studio-api migrate   # a deployment
pnpm --filter @codaco/studio-server apply-schema     # a checkout
pnpm --filter @codaco/studio-server seed
```

All of them are idempotent, and `seed` refuses against a database whose
fingerprint does not match. Four things are worth knowing before you rely on
them:

- **The two schema commands are not interchangeable, and both are honest about
  which they are.** `apply-schema` is `drizzle-kit push`: it reconciles a
  database to this build's definitions, whatever state it was in, and it needs
  a repository checkout because drizzle-kit is a development dependency that
  must never reach the bundle. `migrate` is the deployed half, and pre-release
  it can do less: the build renders the statements push would have produced
  into `dist/schema-ddl.json`, and the command executes them into an _empty_
  database, is a no-op against a current one, and **refuses** a database some
  other build created rather than reconciling it — recreate it, or wait for the
  migration system (#1901), which replaces the internals of this command
  without changing the command. Both stamp the same fingerprint, and every
  process refuses a database that does not carry this build's.
- **No deployment applies schema by booting.** The server only verifies the
  fingerprint at boot. A stale or never-provisioned database stops the boot
  with the remedy; a configured database it cannot reach fails it too. Only the
  development lane comes up anyway and keeps retrying, because only there is
  the cause a container that has not finished starting or a boot reset that
  has not landed yet (`dev.ts --prepare` applies the schema itself when the
  database has none).
- **The login needs `CREATEROLE` the first time.** `apply-schema` creates the
  `studio_app` and `studio_maintenance` roles the server runs as (see
  [Tenancy](#tenancy)) and grants the login the right to assume them. The
  default login on managed Postgres (Neon, RDS, Supabase) holds `CREATEROLE`;
  where yours does not, create them once as an administrator and re-run:

  ```sql
  CREATE ROLE studio_app NOLOGIN;
  CREATE ROLE studio_maintenance NOLOGIN;
  GRANT studio_app, studio_maintenance TO <login> WITH SET TRUE;
  ```

- **`seed` wipes every table and repopulates synthetic content** (faker,
  `src/db/seed.ts` and `src/db/seed/`): five teams with a mix of members
  across every team role, and one fixed admin account —
  `admin@studio.test` / `studio-admin-not-for-production` — who owns every
  seeded team and signs in through the real email/password endpoint like any
  other credential account. Each team gets a protocol line published twice
  through `ProtocolStore`, five studies spanning every lifecycle state and
  both participation modes, their waves, participants, tokenized interview
  links, interview sessions carrying real networks generated from the version
  each session pins, consent documents and records, scheduling and messaging,
  service tokens, gallery templates, assets, webhooks, experiments, feedback,
  monitoring rollups computed from the seeded sessions, and audit history
  appended through the real audit writer. Participants carry plain `email`,
  `phone`, `name` and `attributes` columns, and every secret it writes is a
  real sealed one — each team's webhook signing secrets and one API-key
  protocol asset, and a linked Google account for the admin — so it needs the
  keyring, and a seeded database exercises all three secret stores.
  Seeded assets are metadata only — no bytes are uploaded, so
  `/storage/:hash` honestly 404s in development — and the plaintext of the
  anonymous interview links is printed at the end beside the admin
  credentials. `--scale=large` raises the volumes to the #1246 load shape and
  takes minutes; the default `demo` scale runs in a few seconds, which is
  what makes it affordable on every `pnpm dev` boot. The data is reproducible
  — `faker.seed()` pins the PRNG, every id, timestamp and encryption nonce is
  drawn from it, and a test seeds twice and compares the two databases row by
  row — so re-running `seed` is a no-op for anyone diffing what changed, not
  an accumulation of more rows, and the wipe and the inserts share one
  transaction, so a failure part-way leaves the previous data in place.
  **Never point it at a database carrying real data** — it deletes everything
  first. Like `db:reset`, it refuses a non-loopback database unless you pass
  `--force`, and it refuses to give a non-loopback database the published
  admin password: set `STUDIO_SEED_ADMIN_PASSWORD` to a value chosen for that
  instance, because the published one is a working credential on any
  reachable instance that keeps it. Real onboarding (the first team owner and
  team invitations) replaces this step on #1256; until then, it is how any
  fresh instance gets something to sign in to.

### First-run setup

A fresh instance has nobody in it, so there is no account to sign in with and
no way to authenticate the person who should have the first one. The schema
step closes that gap: `apply-schema` — and, in a container, the image's
`migrate` command — issues a **bootstrap token** and prints it, once, in the
output an operator is already reading:

```text
────────────────────────────────────────────────────────────────────────
FIRST-RUN SETUP TOKEN

  wZ0m…

Open https://studio.example.org/setup and enter it to create the first owner
account and name this instance.
```

Open `/setup` on that instance, paste the token, name the instance and create
the owner's account. The instance is then set up: the token is spent, the
browser is signed in as the owner, and `/setup` answers as a not-found from
then on — so re-running a deploy can never reopen it. Only a sha256 of the
token is stored, so nothing on the server can print it a second time; **if it
is lost, run the schema step again** against the still-ownerless database and
it issues a new one. An instance that already has an owner issues nothing and
prints nothing.

The name is stored with the instance and reported by both status surfaces —
the app's `status` procedure and `/api/v1/status`. Until one is given, both
report the product name.

In development none of this is in the way: `seed` makes `admin@studio.test`
the owner and names the instance `Studio (development)`, so every `pnpm dev`
boot comes up already set up. To exercise the first-run screen, point the
server at an empty database, run `apply-schema` against it, and open `/setup`
with the token it prints.

## Deployment topologies

Decided 2026-08-11 on #1245, and reshaped by the 2026-09-15 ruling on #1909
into one compose stack. **`apps/studio/docker-compose.yml` is the whole
deployment, and it is the same file in both topologies** — Traefik as the only
ingress, `web`, `api`, `worker`, Valkey, Postgres, Garage, and `migrate` and
`garage-init` as profile-gated one-shots. What differs between the topologies
is which paths exist, not which file is run.

The stack and its routing table are drawn in
[`docs/topology.md`](./docs/topology.md); standing one up is
[the self-host guide](./docs/self-host/README.md), which takes an institution
from two downloaded files to a signed-in owner and covers the swaps, the
upgrade sequence, backups and the Postgres major upgrade. `dev:stack` runs the
same thing locally (see [Development](#running-the-whole-stack-locally)).

`STUDIO_DEPLOYMENT_MODE` picks the topology at runtime, so one pair of images
serves both. The managed-only surfaces — marketing, pricing, legal, the sign-up
funnel and `/team/$teamId/billing` — are refused on a self-hosted instance, and
first-run `/setup` is refused on the managed service, so no tenant can reach
instance configuration. `/` is served in both: a self-hoster's origin root is
the URL they hand their researchers, and refusing it would make the instance
dead at the address people type.

The classification is one list, in `@codaco/studio-rpc`'s `surfaces` module —
the only code both deployables import. The server reports the mode over the
`status` procedure and the client's route tree reads the same list, so the two
cannot drift. Unset means `self-hosted`, the fail-closed value: a managed
deployment that forgets the variable refuses its own pricing page on the first
smoke request, where the opposite default would have an institution's instance
quietly publishing one.

Since #1909 the refusal is the client's alone: nginx serves every page path, so
the server sees none to refuse and the HTTP-layer gate that used to sit beside
its static mount is gone.

What the managed service adds is configuration rather than architecture: the
same compose file with its own `.env`, pointing the five `S3_*` variables at an
R2 bucket instead of the stack's Garage. There is no CDN in front of the client
— nginx behind the ingress is enough at the expected scale — and no second
topology to maintain. The web process stays a single replica, as it already
did: the sync leases it holds are per-process state (#1247). The audit
denial-rate window used to be a second reason and is not one any more — it
counts in Valkey now, like every other limit (#1909) — so what a second replica
still needs is somewhere shared for the sync leases to live. Workers have no
such state and may be scaled — pg-boss hands each job, and each firing of a
cron schedule, to exactly one of them (see
[Background work](#background-work)).

The platform that runs it — the host, image publishing, the deploy workflows
and staging — is
[#1910](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1910).

A self-host is one team, or a few, under exactly the enforcement the managed
service runs: there is no single-tenant code path.

### What deploys when

| Release contains                 | Deploys                      | Live-session impact              |
| -------------------------------- | ---------------------------- | -------------------------------- |
| Client only                      | `studio-web`                 | None                             |
| Server only (boundary untouched) | `studio-api`                 | WS reconnect + resume            |
| Additive boundary change         | Server, then client          | WS reconnect + resume            |
| Breaking boundary change         | Coordinated: server → client | Forced by the compatibility gate |

Backend deploys drop live WebSocket sessions by design, so the server drains
on SIGTERM (close 1001, stop the listener, bounded timeout) and the sync
protocol's reconnect-and-resume path makes the interruption routine (#1247).
Managed backend deploys trigger on `@codaco/studio-server` version changes —
never on image rebuilds — so client-only releases cannot bounce the backend.
While the API container is being replaced, the ingress serves the static
maintenance page from `studio-web` (`client/public/maintenance.html`) for every
path except `/healthz` and `/readyz`, which pass through untouched so the
deploy and the container runtime always read the real status.
