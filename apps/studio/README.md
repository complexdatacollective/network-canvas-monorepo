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
  (Node 24 baseline), one persistent process serving every surface below,
  plus static client assets in the self-host topology. It owns the database:
  `src/db` holds the pool and the schema, and `src/protocol` is the sectioned,
  content-addressed protocol store (#1276) built on top of it.
- `packages/studio-rpc` — `@codaco/studio-rpc`: the internal RPC boundary
  (Zod schemas + typed oRPC contract). The only shared code between the
  halves.
- `packages/studio-sync` — `@codaco/studio-sync`: the sync protocol core
  (#1247). Isomorphic: the client imports its apply engine, the server its
  lease and commit engine and the schema those run against.

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
the managed topology, MinIO (or any S3-compatible endpoint) self-hosted.
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

## Development

```bash
pnpm --filter @codaco/studio-server dev
pnpm --filter @codaco/studio-client dev
```

Two processes, one origin: the Vite dev server (port 5173) serves the SPA and
proxies `/api`, `/rpc`, `/storage`, `/healthz`, and `/ws` to the server
(port 3000) — playing the role the CDN plays in the managed topology, so the
browser sees a single origin in every topology. The server restarts on server
and `studio-rpc` source changes; the client has HMR.

The server's dev script also provisions **MinIO in Docker** (branch-scoped
container and volume, port 9100, bucket auto-created — mirroring Fresco's
`dev-s3` script), so asset storage works locally without any third-party
service. Docker must be running. The server's asset integration tests run
against this MinIO and skip when no object store is reachable.

The dev script likewise provisions **Postgres in Docker** (`dev-pg` — port
54318, `studio_dev` database auto-created). The port and credentials match
what `packages/studio-sync`'s conformance suite expects, so the one container
serves both; an externally managed Postgres already answering on the port is
used as-is. The server's database integration tests skip when no Postgres is
reachable. In production the connection comes from `DATABASE_URL`; when it is
unset the server still boots and database-backed surfaces refuse, mirroring
the S3 degradation contract.

### Signing in during development

Authentication (better-auth behind the `src/auth` seam, per #1245/#1255) is
active by default in development: the auth schema is applied to the dev
Postgres at boot, and magic-link email is delivered to the **server console**
— submit the sign-in form, copy the printed link into the browser. To
exercise real email instead, run [Mailpit](https://mailpit.axllent.org)
(`docker run -d -p 8025:8025 -p 1025:1025 axllent/mailpit`) and start the
server with `SMTP_URL=smtp://localhost:1025`; sent mail appears at
`http://localhost:8025`.

Auth configuration follows the same all-or-nothing, fail-fast shape as S3;
every variable is catalogued under [Environment](#environment) below.

### Changing the schema

There is deliberately no migration system yet. Pre-release, a schema change
means reconciling or recreating the database rather than migrating it —
`drizzle-kit push` semantics. Real migrations (`drizzle-kit generate`, from
the same table definitions) must land before a release carries data worth
keeping.

Studio has one schema, defined as Drizzle tables in three modules that live
with their owners: better-auth's tables in `server/src/db/auth-schema.ts`, the
sync engine's drafts, sections, manifests, leases and command log in
`packages/studio-sync/src/schema.ts`, and the protocol store's versioning
tables in `server/src/protocol/schema.ts`. The PL/pgSQL immutability functions
and triggers, which Drizzle cannot express, ride in raw-SQL sidecar exports
beside their tables — as do the parts of row-level security that drizzle-kit
does not manage: the roles, `FORCE ROW LEVEL SECURITY`, and the grants (see
[Tenancy](#tenancy)). `server/src/db/schema.ts` collects all of it into the
`SCHEMA` and `SIDECARS` exports that `server/scripts/apply.ts` applies. The
policies themselves are `pgPolicy` entries on the table definitions, which is
why `drizzle-kit` is pinned to the 1.0 release candidate: the stable line's
`push` silently drops their `USING`/`WITH CHECK` expressions.

<!-- generated:schema-docs start -->

#### Generated entity-relationship diagram

<!-- Generated by `pnpm --filter @codaco/studio-server sync-fingerprint` from the assembled Drizzle schema and raw-SQL sidecars. Do not edit by hand. -->

[![Network Canvas Studio entity-relationship diagram](./schema-erd.svg)](./schema-erd.svg)

Open the image for the full-size diagram. Tables with row-level security or trigger sidecars carry those details as SVG tooltips. The diagram shows physical foreign-key constraints; deliberately unconstrained logical references are not drawn as relationships. The renderer uses `1`/`*` edge endpoints, so optionality remains visible through each column's not-null marker rather than the edge.

Schema fingerprint: `2b495168bb20c049faa7cf71d05bf0f056c40c220257eb121ad46a18ca1c8bbe`.

Sidecar behavior that cannot be represented as ERD relationships:

| Scope                                                                                                                                               | Sidecar-enforced behavior                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles                                                                                                                                               | `studio_app` (NOLOGIN NOSUPERUSER NOBYPASSRLS); `studio_maintenance` (NOLOGIN NOSUPERUSER NOBYPASSRLS); the applying login receives SET on both roles.                                                   |
| Schema and sequences                                                                                                                                | Both roles receive schema USAGE plus USAGE and SELECT on all sequences.                                                                                                                                  |
| All Studio tables                                                                                                                                   | Both roles initially receive SELECT, INSERT, UPDATE, and DELETE through the access sidecar; table-specific revocations below are applied afterwards.                                                     |
| `drafts`, `sections`, `manifests`, `leases`, `command_log`, `protocols`, `protocol_versions`, `version_sections`, `protocol_drafts`, `audit_events` | Drizzle policy `team_isolation` plus sidecar FORCE ROW LEVEL SECURITY and tenant-table DML grants.                                                                                                       |
| `sections`                                                                                                                                          | `sections_immutable`: BEFORE UPDATE; FOR EACH ROW WHEN (NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.doc IS DISTINCT FROM OLD.doc) → `sections_are_immutable()` |
| `protocol_versions`                                                                                                                                 | `protocol_versions_immutable`: BEFORE UPDATE OR DELETE → `protocol_versions_are_immutable()`                                                                                                             |
| `version_sections`                                                                                                                                  | `version_sections_immutable`: BEFORE UPDATE OR DELETE → `protocol_versions_are_immutable()`; `version_sections_insert_frozen`: BEFORE INSERT → `version_sections_pins_are_frozen()`                      |
| `audit_events`                                                                                                                                      | `audit_events_immutable`: BEFORE UPDATE OR DELETE → `audit_events_are_immutable()`                                                                                                                       |
| `audit_events` privileges                                                                                                                           | Revokes UPDATE, DELETE, TRUNCATE from studio_app, studio_maintenance.                                                                                                                                    |

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
needs refreshing; the test suite rejects either generated artifact when stale.

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

Teams (#1249) are the tenant boundary. Every domain row — protocols, versions,
drafts, sections, manifests, leases, the command log — carries a denormalized
`team_id`, pinned to its parent through composite foreign keys, and section
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
visited anyone. The better-auth tables carry no policy: better-auth and
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

## Environment

`apps/studio/server/src/env.ts` is the only module in the server that reads
`process.env` — the repo-wide oxlint `no-process-env` rule enforces that, and
everything else takes a resolved `StudioEnv`. It validates in two layers:
`src/env/variables.ts` declares a schema per variable, and `src/env/resolve.ts`
applies the rules that span several at once (all-or-nothing `S3_*`, the
`SMTP_URL`/`EMAIL_FROM` pairing, the mailer's three-way resolution).

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

No deployment path loads `.env.development`: the Docker image never copies it,
Netlify injects variables into the process instead, and `pnpm start` reads
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

| Variable              | What it is                                                                               | Development default | Real deployment                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`            | Runtime mode. Anything other than `production` leaves development affordances available. | `development`       | Set to `production` by the Docker image and by Netlify.                                                               |
| `STUDIO_DEV_DEFAULTS` | Marks the process as running against the committed development defaults.                 | `1`                 | Never set. It is refused at boot unless `NODE_ENV` is `development` or `test`.                                        |
| `PORT`                | TCP port the HTTP server listens on.                                                     | —                   | Unset ⇒ 3000.                                                                                                         |
| `HOST`                | Interface the HTTP server binds to.                                                      | —                   | Unset ⇒ `0.0.0.0`.                                                                                                    |
| `CLIENT_DIST`         | Directory of built client assets to serve, resolved against the working directory.       | —                   | Unset ⇒ `../client` relative to the server bundle, the Docker image layout. Irrelevant where a CDN serves the client. |

### Object storage

| Variable               | What it is                                                    | Development default     | Real deployment                                |
| ---------------------- | ------------------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| `S3_ENDPOINT`          | S3-compatible endpoint holding content-addressed asset bytes. | `http://localhost:9100` | Required with the other four `S3_*` variables. |
| `S3_REGION`            | Region passed to the S3 client.                               | `us-east-1`             | Required with the other four `S3_*` variables. |
| `S3_BUCKET`            | Bucket asset objects are written to and read from.            | `studio-dev`            | Required with the other four `S3_*` variables. |
| `S3_ACCESS_KEY_ID`     | Access key for the object store.                              | `minioadmin`            | Required with the other four `S3_*` variables. |
| `S3_SECRET_ACCESS_KEY` | Secret key for the object store.                              | `minioadmin`            | Required with the other four `S3_*` variables. |

### Database

| Variable       | What it is                                             | Development default                                    | Real deployment                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string, `pg.Pool`’s native format. | `postgres://postgres:spike@127.0.0.1:54318/studio_dev` | Unset ⇒ no database; auth and sync refuse while the server still boots. The login owns the schema and needs `CREATEROLE` the first time `apply-schema` runs; the server runs as the `studio_app` role it creates. |

### Authentication

| Variable                  | What it is                                                                                                    | Development default                    | Real deployment                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`      | Signing secret for sessions and magic-link tokens.                                                            | `studio-dev-secret-not-for-production` | Required whenever `DATABASE_URL` is set. Generate one with `openssl rand -base64 32`.                                                                                                                                                          |
| `PUBLIC_URL`              | The browser-facing origin. Cookies and magic-link URLs are minted against it.                                 | `http://localhost:5173`                | Required whenever `DATABASE_URL` is set.                                                                                                                                                                                                       |
| `SMTP_URL`                | SMTP transport magic-link email is sent through.                                                              | —                                      | Unset ⇒ magic-link sends refuse. A sign-in link is never written to the log outside development.                                                                                                                                               |
| `EMAIL_FROM`              | From address on magic-link email.                                                                             | `studio-dev@localhost`                 | Required alongside `SMTP_URL`, and refused without it.                                                                                                                                                                                         |
| `GOOGLE_CLIENT_ID`        | OAuth client ID for "Continue with Google" sign-in (#1255).                                                   | —                                      | Required with `GOOGLE_CLIENT_SECRET`; unset ⇒ Google sign-in is not offered. Create a Web application OAuth client in the Google Cloud Console with `<PUBLIC_URL>/api/auth/callback/google` as an authorized redirect URI.                     |
| `GOOGLE_CLIENT_SECRET`    | OAuth client secret paired with `GOOGLE_CLIENT_ID`.                                                           | —                                      | Required with `GOOGLE_CLIENT_ID`, and refused without it.                                                                                                                                                                                      |
| `MICROSOFT_CLIENT_ID`     | Entra application (client) ID for "Continue with Microsoft" sign-in (#1255).                                  | —                                      | Required with `MICROSOFT_CLIENT_SECRET`; unset ⇒ Microsoft sign-in is not offered. Register an application in Microsoft Entra with `<PUBLIC_URL>/api/auth/callback/microsoft` as a Web redirect URI.                                           |
| `MICROSOFT_CLIENT_SECRET` | Client secret paired with `MICROSOFT_CLIENT_ID`.                                                              | —                                      | Required with `MICROSOFT_CLIENT_ID`, and refused without it.                                                                                                                                                                                   |
| `MICROSOFT_TENANT_ID`     | Entra tenant to accept sign-ins from, for single-tenant registrations.                                        | —                                      | Unset ⇒ `common` (any organizational or personal Microsoft account, matching a multitenant registration). Refused without the other two `MICROSOFT_*` variables.                                                                               |
| `TRUSTED_PROXIES`         | Comma-separated proxy addresses or CIDRs whose `X-Forwarded-For` may be trusted when resolving the client IP. | —                                      | Unset ⇒ forwarded headers are not read at all, which is safe but shares one rate-limit bucket across every client. List only your own proxies, and only where each one overwrites the header rather than appending to a client-supplied value. |

<!-- generated:env end -->

## Production

```bash
pnpm --filter @codaco/studio-client build   # client/dist — static assets
pnpm --filter @codaco/studio-server build   # server/dist — Node bundle
pnpm --filter @codaco/studio-server start   # serves both locally
```

The Docker image — the self-host artifact — builds from the monorepo root and
contains the server bundle plus the built client assets:

```bash
docker build -f apps/studio/Dockerfile -t network-canvas-studio .
docker run --rm -p 3000:3000 network-canvas-studio
```

### Database schema and seeding

Two steps, run **once per deployment** against `DATABASE_URL` — not once per
replica, which is why they are commands rather than boot work:

```bash
pnpm --filter @codaco/studio-server apply-schema
pnpm --filter @codaco/studio-server seed
```

Both are idempotent and identical in every topology: `apply-schema` is
`drizzle-kit push` — it reconciles the database to this build's definitions
and stamps the fingerprint — and `seed` refuses against a database whose
fingerprint does not match. Three things are worth knowing before you rely on
them:

- **Every lane needs `apply-schema`, and it runs from a repo checkout.** The
  server only verifies the fingerprint at boot — drizzle-kit cannot ship in
  the server bundle, so no deployment applies schema by booting. A stale or
  never-provisioned database stops the boot with the remedy; a configured
  database it cannot reach fails it too. Only the development lane comes up
  anyway and keeps retrying, because only there is the cause a container that
  has not finished starting or a `dev-pg` schema provision that has not
  landed yet (`dev-pg` applies the schema itself when the database has none).
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

- **The Netlify lane has no automation.** Its build command does not touch the
  database and its function has no boot, so `apply-schema` is a manual step
  there — and consequently the only place that lane ever detects a stale
  schema.
- **`seed` currently writes nothing.** Studio has no domain entities yet; the
  first team owner and the default team land with team invitations (#1256).
  The step is documented now so the procedure does not change when it starts
  doing something.

## Deployment topologies

Decided 2026-08-11 on #1245. Both topologies run the same artifacts and
present a single origin; they differ only in who serves the static client
assets.

### Managed service

Cloudflare fronts the single hostname: it serves the client's hashed assets
from the CDN (retaining old hashes across deploys, so open tabs never lose
their chunks) and routes the server's paths to the origin — a persistent Node
process colocated with the Postgres primary. Edge compute is a non-goal;
replicas serve only reads the query layer marks replica-tolerant (#1246).

```mermaid
graph LR
    P[Participant / researcher<br/>browser — Studio SPA]
    X[External tools<br/>Python, R, curl]

    subgraph CF[Cloudflare — one origin]
        CDN[CDN<br/>static client assets<br/>immutable hashed chunks]
        RT[Route<br/>/api/* · /rpc · /ws]
    end

    subgraph O[Origin region]
        S[studio-server<br/>persistent Node process<br/>WS + leases: single replica]
        PG[(Postgres<br/>primary)]
        RR[(Read replicas<br/>replica-tolerant<br/>reads only)]
    end

    R2[(R2 object storage<br/>content-addressed assets)]

    P -->|assets| CDN
    P -->|"/rpc · /ws (cookie)"| RT
    X -->|"/api/v1 (PAT)"| RT
    RT --> S
    S --> PG
    S -.-> RR
    PG -.->|streaming replication| RR
    S -->|S3 API| R2
    CDN -.->|stimuli, signed URLs| R2
```

### Self-host

The same server image embeds and serves the client assets itself: the app
container, Postgres, and an S3-compatible object store (MinIO by default, or
bring your own endpoint) — the same shape Fresco self-hosters already run.

```mermaid
graph LR
    B[Browser]

    subgraph H[Researcher-operated host — Docker]
        C[studio container<br/>server + embedded client assets<br/>assets · /api · /rpc · /ws · /storage]
        PG[(Postgres<br/>container)]
        M[(MinIO container<br/>or BYO S3 endpoint)]
    end

    B -->|one origin| C
    C --> PG
    C -->|S3 API| M
```

The server reads its object store from `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` — all five or
none (partial configuration fails fast). Unset means asset routes refuse
with 503. See [Environment](#environment).

The Postgres login in `DATABASE_URL` owns the schema and needs `CREATEROLE`
the first time it is applied (see
[Database schema and seeding](#database-schema-and-seeding)); the server
itself runs as `studio_app` (see [Tenancy](#tenancy)). A self-host is one
team, or a few, under exactly the enforcement the managed service runs — there
is no single-tenant code path.

### What deploys when

| Release contains                 | Deploys                      | Live-session impact              |
| -------------------------------- | ---------------------------- | -------------------------------- |
| Client only                      | CDN asset publish            | None                             |
| Server only (boundary untouched) | Backend                      | WS reconnect + resume            |
| Additive boundary change         | Server, then client          | WS reconnect + resume            |
| Breaking boundary change         | Coordinated: server → client | Forced by the compatibility gate |

Backend deploys drop live WebSocket sessions by design, so the server drains
on SIGTERM (close 1001, stop the listener, bounded timeout) and the sync
protocol's reconnect-and-resume path makes the interruption routine (#1247).
Managed backend deploys trigger on `@codaco/studio-server` version changes —
never on image rebuilds — so client-only releases cannot bounce the backend.
