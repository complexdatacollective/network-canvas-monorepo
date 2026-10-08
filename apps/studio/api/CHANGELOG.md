# @codaco/studio-api

## 0.3.0

### Minor Changes

- Rate limiting now counts in Valkey, so a limit means the same thing however
  many API containers are running.

  Every surface is limited: sign-in per client address and per email address,
  invitation acceptance per token, internal RPC per user and per team, storage
  reads, the public data API per token, and WebSocket upgrades per user. Limits
  for participant redemption and interview sync are declared and take effect
  with the participant routes. Each limit is a constant in the server's
  `rate-limit/scopes.ts`, with its count, its window, and why that number.

  A refused request answers 429 with `Retry-After` and problem JSON. Addresses
  and email addresses are hashed before they are used as keys, and a refusal is
  logged with its scope and never with whom it refused.

  If the store cannot be reached, every request proceeds and readiness reports
  the limiter as degraded — a rate limit protects against abuse and is not worth
  an outage.

  The audit log's denied-attempts window moves to the same store and the
  summaries it produces are now written by a new `denied-attempts-summary` job on
  the worker, every minute. They used to be written when the web process shut
  down, which a container that was killed rather than stopped never did.

- Studio ships a reference Docker Compose stack: Traefik as the only ingress,
  the nginx client container, the API and the worker from one image, Valkey,
  Postgres, and Garage as the S3-compatible object store, with `migrate` and a
  Garage bootstrap as profile-gated one-shots. A self-hoster downloads the
  compose file and the `.env.example` beside it, writes two file secrets, and
  runs `docker compose up -d` then `docker compose run --rm migrate`. Every
  third-party image is pinned by digest, Traefik's routing and Garage's
  configuration are inline in the file, and the ingress, database, object store
  and rate-limit store are each one block to swap for an institution's own
  service.

  One hostname serves the app, the API, the WebSocket and asset storage, so the
  browser stays same-origin; while the API container is being replaced, the
  static maintenance page is served from the client container with a 503, and
  `/healthz` and `/readyz` pass through untouched so a deploy and the container
  runtime always read the real status.

  The database password is now delivered as a file secret: `DATABASE_PASSWORD_FILE`
  names a file whose contents are inserted into a `DATABASE_URL` that carries no
  password, so the password appears in neither `docker inspect` nor any process
  environment. Setting both is refused at boot.

  Local development is one command. `pnpm --filter @codaco/studio-api dev`
  brings up the same stack's Postgres, Garage, Valkey and a Mailpit sink,
  bootstraps the bucket, resets and seeds the database, and runs the server, the
  worker and the client together; `dev:down` stops it. The hand-rolled
  `dev-pg`/`dev-s3` containers and MinIO are gone, sign-in mail is delivered
  through Mailpit rather than printed to the console, and a new
  `STUDIO_TELEMETRY` variable carries the development opt-out ahead of the
  reporting it will govern.

- The public data API at `/api/v1` is served from its Effect `HttpApi` contract.
  `GET /api/v1/status` answers with the same document as before, and every
  request under `/api/v1`, whatever its method, is now counted against the
  `public_api` limit (`HEAD`, `OPTIONS` and unusual methods were not counted
  before).

  Paths under `/api/v1` now match the way the rest of the server's routes do:
  case-insensitively, with repeated slashes collapsed and a trailing slash
  ignored, so `/API/v1//status` is `/api/v1/status` (it was a 404). A path with
  `./` or `../` segments is no longer resolved and answers 404, and `HEAD` on
  any `/api/v1` path answers 404.

  `/api/v1/openapi.json` is now an OpenAPI 3.1.0 document (it was 3.1.2) generated
  from the contract. The operation id, summary, server entry and `Status` schema
  are unchanged; the operation now carries a `status` tag, an empty `security`
  list and a 404 response in the RFC 9457 problem shape (`application/problem+json`).

  `/api/v1/docs` is new: a browsable API reference for the document, served
  compressed and cacheable (an ETag revalidates it to a 304), loading nothing
  from a third party, and limited to 30 views a minute per address on top of
  the public API limit (the new `api_docs` scope).

  A problem document's `status` is now an integer on every Studio surface: the
  published schema says `integer`, and a document whose `status` is fractional
  or non-finite is refused when decoded. Every status Studio sends already was
  one.

  `GET /api/v1/status` answers 500 rather than 400 if the server ever produces a
  status document it cannot encode.

- Sign-in now runs on Studio's own database client. Signing up, and linking a
  Google or Microsoft account to an existing one, now either completes or leaves
  nothing behind. Before, an interrupted sign-up could leave a half-created
  account.

  Every signed-in RPC call is now charged against its caller's rate limit before
  the procedure does any work. Sign-in, storage, public API and WebSocket limits still answer
  `429` with a `Retry-After` header and a problem-JSON body. The limits, and the
  shared Valkey store they count in, are unchanged.

  `studio-api maintenance on [reason]` and `studio-api maintenance off` now work.
  While maintenance is on, every request except `/healthz` and `/readyz` answers
  `503` with `Retry-After: 30`. `/readyz` reports `failing` and names
  `maintenance`, and the worker stops claiming jobs until maintenance is turned
  off. A WebSocket that was already open is closed when maintenance begins. The
  same `503` is served automatically while a migration holds its lock, or while
  the database is not on this build's schema.

- Studio can now keep its assets in Azure Blob Storage as well as in any
  S3-compatible store. A new `STUDIO_OBJECT_STORE` variable names which: `s3` or
  `azure-blob`. Left unset, Studio runs with no object store, and any `S3_*` or
  `AZURE_*` variable set without it is refused at boot; `.env.example` ships with
  `s3`.

  An Azure deployment names its container with `AZURE_STORAGE_CONTAINER` and its
  storage account with `AZURE_STORAGE_ACCOUNT_URL`, and signs in as the managed
  identity of the machine it runs on, so no account key is needed. Give that
  identity the Storage Blob Data Contributor role on the one container, and set
  `AZURE_CLIENT_ID` if it is a user-assigned identity. A host outside Azure can
  use `AZURE_STORAGE_CONNECTION_STRING` instead. Studio never creates the
  container; it must already exist.

  A mixed or incomplete configuration is refused at boot: any `S3_*` variable
  beside `azure-blob`, any `AZURE_*` variable beside `s3`, a missing container,
  or both an account URL and a connection string. `/readyz` names the object
  store as failing when the bucket or container cannot be reached, whichever
  kind it is, and assets are stored under the same content-addressed keys either
  way.

  The compose stack passes the new variables through from `.env`, only points
  `S3_ENDPOINT` at its own Garage while an S3 access key is set, and bootstraps
  that Garage only for `s3`, so an Azure deployment that empties the `S3_*`
  values gets no S3 configuration at all. The self-host guide has a new "Azure Blob Storage" section on the swap
  page, and the requirements page now sets out what any object store must
  provide.

- Upgrade better-auth to 1.7.5 and key accounts the way it does again. 1.7.0 through 1.7.2 matched a credential or OAuth account on an extra `issuer` column, so the schema carried one and made it required; 1.7.3 reverted to the 1.6 behaviour, where `(providerId, accountId)` is the whole identity, and refuses to start against a schema that still demands a column it never writes. The column and its unique index go, replaced by a unique index on `(providerId, accountId)` — the pair every account lookup now matches on, and the one better-auth itself refuses to disambiguate if two rows share it. The development seed writes both its credential and its linked-Google account without the column, the auth adapter's own suite matches accounts the way better-auth now does, and the schema fingerprint moves with it, so an existing development database is re-provisioned on next boot.
- Studio now ships as two container images instead of one. `studio-api` carries
  the server, and its entrypoint chooses the process: `serve` for HTTP, RPC and
  the WebSocket endpoint, `worker` for background jobs, `migrate`, which creates
  and upgrades the schema — so a deployment no longer needs a repository checkout
  to provision one — and `maintenance on|off` and `rotate-secrets`. `studio-web` is nginx serving the built client,
  its hashed assets under a year-long immutable cache, and a static maintenance
  page for the seconds an upgrade replaces the API.

  The server no longer serves the client in any topology, and the Netlify entry
  point and its configuration are gone with it. The gate that used to refuse the
  other deployment's page paths at the HTTP layer is now the client's alone: a
  route belonging to one topology answers with a branded not-found screen on the
  other, and an address that matches no route at all gets the same screen instead
  of the router's default text. `CLIENT_DIST` is removed.

  `migrate` applies everything in one transaction, so a run that fails part-way
  leaves the database as it found it rather than in a state the next run would
  refuse. A process that will not boot against a database now prints remedies it
  can actually run: the image's commands in a container, the repository's scripts
  in a checkout.

  Both processes answer `GET /healthz` (liveness) and `GET /readyz`, which
  reports each dependency — the database, the schema fingerprint, the object
  store, and, on the worker, the job queue — and answers 503 naming the
  one that failed. The worker serves them on a loopback-only listener, on the new
  `WORKER_HEALTH_PORT` (default 3001), so a container healthcheck can ask a
  process that answers nothing else whether it is working.

  The protocol store now keeps an unreferenced section for three days rather than
  one, so the window always exceeds the daily backup interval.

- Studio's server now reaches its database through one client per role, and
  every command runs inside a single transaction scoped to the team it acts on.
  A command cannot open a team's transaction without first proving it may act in
  that team, so an authorization check can no longer be skipped by a code path
  that forgot it. The protocol commands now check a caller's access to the
  protocol inside the same transaction as the edit, so access revoked while a
  request is in flight can no longer let that edit through. Moving a stage in a
  draft that another editor has changed since it was read is now refused as a
  conflict the editor can retry after re-reading, instead of failing as a server
  error.

  `DATABASE_URL` must now be a `postgres://` URL. A bare socket path, a keyword
  connection string, a URL with credentials but no host, or an `sslmode` other
  than `disable`, `require`, `verify-ca` or `verify-full` is refused at boot with
  a message naming what to use instead. A Unix socket is written with `localhost`
  as the host and the socket's directory in the `host` parameter —
  `postgres://studio@localhost/studio?host=/var/run/postgresql` — so a password
  from `DATABASE_PASSWORD_FILE` has somewhere to go.

  The development seed moved to `scripts/seed/` and now writes its protocols,
  network summaries and audit history through the same code a running server
  does, instead of copies of it.

- Distinguish the two topologies one Studio artifact serves. `STUDIO_DEPLOYMENT_MODE` (`managed` | `self-hosted`, unset ⇒ `self-hosted`) selects which URL paths a deployment has, from a classification shared by both deployables: the managed-only marketing, pricing, sign-up and billing paths are refused with a real HTTP 404 on a self-hosted instance, and first-run `/setup` is refused on the managed service, so no tenant reaches instance configuration. The refusal still returns the app shell, so the client renders its branded not-found state behind an honest status line, and `Cache-Control: no-store` keeps nothing caching it. `/` is served in both, because a self-hoster's origin root is the URL they hand their researchers. The `status` procedure now reports the mode, and the static-asset wiring moves out of the server entrypoint into `mountClient`.
- The API process, the worker, `migrate` and `rotate-secrets` are now Effect
  programs on Effect's Node HTTP server (stage 1 of the Effect 4 migration,
  #1927). What a deployment sees:

  - Logs are one JSON line each on stdout. Boot failures still print a plain
    message.
  - Exit codes come from the runtime's teardown: 0 after a clean stop, 130 on
    SIGTERM/SIGINT, 1 when the process refuses to start (missing database, a
    keyring that cannot open the stored secrets).
  - On a deploy, open editor sessions are asked to finish and their sockets are
    closed with a plain close frame rather than the previous `1001 Server
shutting down`; browsers report it as a clean close (#1247).
  - Every response carries an `x-request-id` header, and every error response
    Studio synthesises is RFC 9457 problem JSON.
  - The worker keeps answering `/readyz` while it finishes its in-flight jobs
    on a stop; the health listener now closes after the job drain rather than
    before it.
  - `migrate` and `rotate-secrets` still print a refusal as the one sentence
    to act on, and still exit 1.
  - A new optional `OTEL_EXPORTER_OTLP_ENDPOINT` variable exports logs, traces
    and metrics to an OTLP/HTTP collector when `STUDIO_TELEMETRY` is on; unset
    means nothing is exported (#1897).
  - `@hono/node-server` and `ws` are no longer direct dependencies of the server.

- The Studio server's environment is one Effect Schema.

  `src/env/schema.ts` replaces the pair of files that used to split the job —
  a zod schema per variable in `variables.ts`, and a parallel catalogue of prose
  in `catalogue.ts` that a typecheck kept exhaustive. Each variable is now a
  single field: its shape and validation, and, as schema annotations, the group
  it belongs to, what it is, and what a real deployment does with it when it is
  set and when it is not. `.env.development`, `.env.example` and the README's
  environment table are generated by reading those annotations back, so the
  documentation a deployer reads and the validation their value meets cannot
  describe different things. The three generated files are byte-for-byte what
  they were, apart from the line naming their source.

  What an operator sees when a variable is wrong has changed. Every bad variable
  is named in one report rather than only the first, each with a line saying what
  the value must be — `PORT must be a whole number between 0 and 65535` — and the
  report never quotes the value it rejected. Half of these variables are
  credentials, and a boot failure is written to the log of every container that
  restarts.

  `SKIP_ENV_VALIDATION` is gone. Nothing in Studio's build or image ever set it:
  the server reads its environment when it runs, not when it is built.

  Yes and no variables (`STUDIO_DEV_DEFAULTS`, `STUDIO_TELEMETRY`) accept `true`,
  `false`, `1` and `0`. The zod helper they used also accepted `yes`, `on`, `y`
  and `enabled` and their opposites, which nothing documented and nothing set.

  Internally, `readEnv()` is unchanged for its callers, and `src/env.ts` is still
  the one module that reads `process.env` — now actually enforced. The repo-wide
  `no-process-env` entry the README and that module both claimed as the
  enforcement was inert: the rule belongs to oxlint's `node` plugin, which is not
  in the repo-wide `plugins` list, so it did nothing anywhere. It is now on for
  `apps/studio/api/src/**`, together with a ban on importing `node:process`,
  because the linter only sees `process.env` reached through the global.

  Beside `readEnv` there is an `Environment` service (an Effect `Context.Tag` and
  a `Layer`), which nothing consumes yet and which is the sanctioned way in for
  the first part of the server that runs under Effect.

- Studio's packages take their final names. The server is `@codaco/studio-api`
  in `apps/studio/api`, the web app is `@codaco/studio-web` in
  `apps/studio/web`. The old internal RPC package is gone: the schemas the two
  halves shared through it now come from `@codaco/studio-contract`, which joins
  the Studio release lane in its place; the old package's changelog is not
  carried over. The image targets (`studio-api`, `studio-web`), the published
  image names and the compose service names are unchanged.

  The API no longer carries Hono or zod. A path no route serves is answered by
  the router's own 404 as problem JSON, which is what the machine surfaces
  (`/api`, `/rpc`, `/storage`) already answered; a path outside them, which the
  ingress never routes here, now gets the same problem JSON rather than a plain
  text 404. The audit event schemas and the invitation email check are Effect
  `Schema` declarations that accept exactly what the zod ones did.

- A freshly installed Studio instance can now be set up by the person who
  installed it. Until now a new deployment had no account to sign in with and no
  way to create one: `/setup` was a placeholder, and the only account any
  instance had came from the development seed.

  The command that creates the database now issues a **bootstrap token** and
  prints it once, in the output the operator is already reading, with the address
  to spend it at. `/setup` takes that token, the name this instance should be
  known by, and the first owner's account — and signs them in as it completes, so
  setting an instance up ends on their own screen rather than back at a sign-in
  form. Only a hash of the token is stored, so a lost one is recovered by running
  the database command again: an instance nobody owns issues a fresh token, and
  an instance somebody owns issues none and prints nothing. Once there is an
  owner, `/setup` is gone — it answers as a page that is not there, on every
  later deploy — so a repeated deploy command can never reopen the door to a live
  instance.

  The name given at setup is stored with the instance, and both status
  surfaces — the app's `status` procedure and `/api/v1/status` — report it in
  place of the product name. Whether first-run setup is still outstanding is
  reported beside it.

  In development nothing changes: the seed makes `admin@studio.test` the owner
  and names the instance `Studio (development)`, so every boot comes up already
  set up.

- Researchers can have a language preference stored on their account, so the
  language they choose follows them to any device they sign in on rather than
  living only in the browser that set it.

  The preference is optional: an account that has never chosen one has no
  stored value, and the interface falls back to the languages the browser asks
  for. Only languages Studio actually supports can be stored.

- Every log line Studio writes is now one JSON record from the same logger, and
  a record written while a request is being handled carries that request's
  `request_id`, the `team_id` of the team it acted on, and the `trace_id` and
  `span_id` of the span it was written in. The request id is the one returned in
  the `x-request-id` header and stored with the request's audit events, so one
  id finds a request's response, its log lines, its trace and its audit trail.
  A record written outside a request carries none of the request keys.

  Log messages are fixed text. The values a message used to quote (queue names,
  job ids, counts, versions) are now separate fields on the record. The worker's
  start-up line, for example, reads `Network Canvas Studio worker started` with
  the version in its own `version` field.

  `STUDIO_LOG_LEVEL` sets the least severe level written (`Info` by default;
  Effect's level names, from `Trace` to `Fatal`, or `None`).

  Values that are not public — researcher emails and names, team, study and
  protocol names, protocol content, participant data, tokens, secrets, asset
  values and client addresses — are now held marked as private from the moment
  they are read, so they appear as `<redacted>` in any log line, trace or error
  built from them. Nothing changes on the wire.

  Logs no longer quote database or driver error text. A failed audit write and a
  failed periodic reading log the error's type and its Postgres error code; the
  full cause of a failed reading is logged at `Debug`. The job worker's
  maintenance warning names what closed the deployment (`maintenance`,
  `migration`, `schema` or `starting`) rather than quoting the maintenance
  reason. An unusable `TRUSTED_PROXIES` entry is reported as a count, not by
  quoting the addresses.

  The first-run setup token, and the sign-in and invitation links the
  development mail transport prints, are written to standard output only and
  never pass through the logger.

- Studio can now be upgraded without losing data. Every release carries its
  schema as numbered migrations, and `migrate` applies the ones a database has
  not recorded yet, all in one transaction: on a new database it creates the
  schema, on a current one it changes nothing, and on an older one it brings it
  forward. It refuses, and changes nothing, a database a newer Studio has
  migrated, one whose recorded migrations differ from the release's, or one with
  Studio's tables and no migration history, and says what to do in each case.

  An upgrade is one sequence of Docker commands, documented in the self-host
  guide's upgrade page, for every release whether or not it changes the schema:

  ```bash
  docker compose run --rm --no-deps api maintenance on
  # wait until /readyz names maintenance mode
  docker compose stop api worker
  # take your backup now
  docker compose pull
  docker compose up -d web api worker
  docker compose run --rm migrate
  docker compose run --rm --no-deps api maintenance off
  ```

  `maintenance on` closes the instance: every request except `/healthz` and
  `/readyz` gets the maintenance page with 503, and the worker claims no more
  jobs. An optional reason — `maintenance on Upgrading to 1.4` — is repeated by
  `/readyz`. Once `/readyz` names maintenance mode, the sequence stops `api` and
  `worker`, which finish the requests and jobs they are already running before
  they exit, so the backup is taken with nothing running that writes to the
  database and holds every write the instance accepted. Jobs created while the
  instance is closed wait and are worked once it reopens. `maintenance off`
  reopens it. Nothing in the app or its API can open or close an instance; only
  the command can.

  The API and the worker no longer refuse to start on a database whose schema is
  not theirs. They start closed — the maintenance page, no jobs — and open by
  themselves once `migrate` has made the schema current, so an upgrade can start
  the new images before it migrates. `/readyz` gains a `maintenance` check that
  names why the instance is closed: maintenance mode, a migration in progress, a
  schema from another release, a database with no Studio schema, or a server
  still starting. Before the first `migrate`, `/readyz` says the database has not
  been set up for Studio yet.

  Rolling an upgrade back is restoring the backup taken during it with the
  previous image digests. The backup page's restore procedure now starts `web`,
  `api` and `worker` from the digests `.env` names and ends with
  `maintenance off`, because a backup taken during an upgrade carries the
  maintenance flag.

  Studio now checks once a day for a newer release. A daily worker job fetches
  `https://releases.networkcanvas.com/studio/manifest.json` with a plain `GET`
  that carries nothing about the instance. When a newer version exists, the
  installation's owner is emailed once for that version, with a link to the
  upgrade guide, and sees a notice in the app with the release date and notes.
  The check is not configurable; an institution that must stop it blocks the
  host.

  The backup page's object-store copy now reads the Garage container's volume
  wherever Compose put it, rather than a volume name that only matched one
  project directory.

- Studio can run more than one API container. Any replica serves any request, so
  no sticky sessions are needed, and an editor whose connection ends on one
  replica picks up on another where they left off.

  Until now the list of who was connected, the decision to give up a closed
  connection's locks, and the files and API keys added to a stage but not yet
  saved all lived inside the one API process that received them, so a second
  replica could not see them. Connections are now rows in the database, beside
  the locks. A staged file is held in the object store under `staging/`, and a
  staged API key in the database, sealed under the keyring. An author keeps the
  section they are editing through the loss of a replica, as long as they
  reconnect within the 30-second lease, and whichever replica they reach next
  can save the stage. When an editor's connection closes, their locks are given
  up only after a 20-second grace, and only if they have not reconnected to any
  replica by then. Upgrades still stop every replica for the maintenance window,
  so expect locks to lapse during one.

  Live updates reach editors on every replica. A replica that commits a change
  rings a doorbell on the Valkey channel `studio:protocol-events`, and the
  others read the new state from the database. Every replica also checks every
  five seconds, so Valkey stays optional: without it, or while it is down,
  updates between replicas arrive at that poll instead of at once, and none are
  lost. `/readyz` gains a `doorbell` check, `degraded` (still 200) when Valkey is
  configured but the replica is not subscribed, and answers 503 with `draining`
  while a replica shuts down. The compose stack's Traefik now reads its API
  server list from a config of its own, `traefik-api-servers`.

  To run a second replica, add it to the compose stack and to Traefik's server
  list, with a health check on `/healthz`, then recreate Traefik, as
  `docs/self-host/run.md` describes. The stack runs one API unless you do. Transaction-mode connection pooling (PgBouncer in
  transaction mode, Hyperdrive) is still not supported for the API and worker.

  **Action needed when upgrading:**

  - Download `docker-compose.yml` again and carry over any changes you made to
    your copy. The new file gives Traefik its API server list as a separate
    config and mounts its dynamic configuration as a directory; running more
    than one API needs both. The upgrade sequence and the restore now stop and
    start every service whose name starts with `api`.
  - The object-store access key, or on Azure the managed identity, must now be
    able to delete and list as well as read and write, and the worker uses it
    too, to clear away staged files nobody saved. On S3, add `s3:DeleteObject`,
    and `s3:ListBucket` if the policy lacks it. On Azure, Storage Blob Data
    Contributor already includes both.
  - If your bucket keeps object versions, add a lifecycle rule that expires
    noncurrent versions under `staging/`. A delete on a versioned bucket only
    hides the object, so without the rule every staged file stays as an old
    version.
  - An instance with no object store can no longer stage a file: adding one to a
    stage is refused, while staging an API key still works. Before this release
    such a file could be staged but never saved, so nothing an author could
    finish before is lost.

  The upgrade and requirements guides say where to make each change.

  For `@codaco/studio-sync`: `renewHeld` now takes a list of owners rather than
  one, renews all their leases in a single statement, and returns each renewed
  lease's owner.

- Put real numbers on the study sidebar's countable destinations, so a researcher
  can see how much is in a study without opening each screen to find out.
  Versions, Participants, Waves and Sessions each carry the count the app-shell
  design gives them, read from the study's own rows through a new
  `studies.counts` procedure: one query, addressed by the study alone and
  refused for exactly the studies its reader could not open, so the four
  numbers are always describing the same study at the same moment.

  A count is a claim, and an unchecked one is worse than none. Until the answer
  arrives — and if it never does, because the read failed — the rows render
  exactly as they did before, with no number at all. A
  study with nothing in it is left unnumbered for the same reason: "Participants"
  reads better than "Participants 0", and neither is ever invented on the
  client's behalf.

  API tokens in the account area gets no count. Tokens are owned by a team and
  answerable to a custodian, so "how many are mine" is not a question the data
  model can answer, and a number that quietly meant "this team's tokens" would be
  the wrong answer rather than a missing one.

- Participant interviews now report anonymous usability analytics: which screens
  a participant reaches, how long they spend there, how they move between them,
  and errors the interview hits. Never their answers, their network, or anything
  that identifies them. The participant's browser sends these events only to the
  Studio instance, which forwards them to Codaco's PostHog project without
  building a person profile and stamps each one with the installation's id.
  Nothing is collected while `STUDIO_TELEMETRY` is off, and a researcher can turn
  participant analytics off for a study when creating it. Upgrading adds an
  `installation_id` to the installation, through the `0002_installation_id`
  migration.
- Studio now serves the four calls a participant's browser makes during an interview: redeeming a link, reading the session, saving answers as they are given, and finishing. No participant page uses them yet.

  Redeeming a link refuses one that is revoked or expired, a study that is draft, paused or closed, and a wave that has not opened or has closed, each with its own reason. A managed participant always returns to their one session in the wave, and redeeming their link again replaces the session's address; an anonymous link starts a new session each time. Redeeming the link of a finished interview says so. Redemption is rate-limited per address, and a participant's own link is also limited on its own; an anonymous study's shared link is not, so a whole study can start at once.

  The session read returns the protocol the session is pinned to, including its API keys, and the network collected so far, and takes the session over for the page that asks. Session reads are rate-limited per session. Answers are saved as rows: each save replaces the session's nodes and edges with what the browser holds, a replayed save changes nothing, and a page that has been taken over is refused. While a study is paused, interviews already under way can continue for the study's grace period before they are stopped.

  Finishing marks the session complete and stores its immutable snapshot in the same transaction, after which the interview can no longer be changed. A finish from a browser holding answers the server has not yet saved is refused as out of date, so the browser can save them and finish again rather than leave them out of the snapshot. A completion job is queued for the webhooks still to come. Team activity records "Interview started" and "Interview completed" for each participant.

- Studio gains the server foundations for participant interview sessions. No
  participant route uses them yet; the participant procedures and pages that do
  are still to come.

  An interview session can now hold its own credential: a session token stored
  only as the SHA-256 of its secret, unique within a team. The token travels in
  a dedicated `x-studio-participant-session` header, never a cookie, and a new
  `RequireSession` middleware looks it up inside the team it names, refusing an
  unknown, malformed or foreign token. A finished interview's token still
  resolves, so a reopened finished interview can be told apart from an invalid
  link. Request traces record the header as redacted.

  The session store records the newest write a participant's browser has had
  applied, so a replayed or out-of-order write changes nothing, and lets a
  second page take a session over, after which the first page's writes are
  refused.

  The participant procedures' contract now matches the interview runtime's
  payload, with every field declared except the protocol document, so a column
  added to the session later cannot reach a participant by accident.

  Audit events can now name a participant as their actor. Team activity labels
  such an actor "Participant", beside their participant code, or a short session
  reference in an anonymous study.

- The database password in `DATABASE_PASSWORD_FILE` can be rotated without restarting Studio. The API and the worker reread the file whenever they open a new database connection, so once the role's password is changed in Postgres and the file holds the new one, every new connection uses it while open connections carry on. The schema and maintenance commands still read the file once, when they start.
- Studio's background work moves onto a job queue of its own, written on Effect, and into a process of its own. One image, two commands: `node dist/index.js` still serves HTTP, the RPC surface and the WebSocket endpoint and may now only create jobs, while `node dist/worker.js` (`start:worker`) runs the jobs and the cron schedules and binds no port — a deployment starts it as a second container from the same image, with `--no-healthcheck`, because the worker deliberately does not serve `/healthz`. `pnpm dev` runs both. Sending mail is the worker's alone: `SMTP_URL` and `EMAIL_FROM` are read by that process and withheld from the web process, sign-in and team-invitation email is queued by the request and sent by the worker, and a worker with no transport configured still boots, runs the rest of its work, and says at error level that mail is waiting. Creating a team invitation while nothing can deliver it therefore queues the message and sends it when a worker with mail returns, instead of refusing with `SERVICE_UNAVAILABLE`. Protocol-store garbage collection, which existed but had nothing running it, now runs hourly on the worker's cron. The SMTP transport's timeouts are also real for the first time — nodemailer discards options passed beside a connection URL, so every send had been using its defaults of two minutes to connect and thirty seconds for a greeting — which is what lets a send that is in flight when a container stops finish, or fail, inside the worker's shutdown window rather than being abandoned mid-attempt. Every job is created inside the transaction that caused it, so a command that rolls back leaves no job behind and a command that commits always leaves exactly one.

  For the database: `apply-schema` and `studio-api migrate` install the queue's own schema, `studio_jobs` — two tables, their indexes, a trigger that announces a new job to any listening worker with `NOTIFY` on commit, and grants that let the application role create a job and nothing else with it — and the fingerprint every process verifies at boot covers that DDL, so a change to it is a schema change like any other: applied once, and refused by every process until it has been. Each queue's retry ladder, lease and retention are declared in `@codaco/studio-sync/jobs` and frozen onto a job's row when it is created, so a redeploy does not change the retries of work already queued. The five outbox-shaped tables lose the `available_at`, `lease_owner` and `lease_expires_at` columns along with the hand-written dispatcher that used them, keeping their terminal state, attempt count and error record.

- The protocol editor talks to Studio over Effect rpc. The editor's socket at
  `/ws` carries imported files as raw bytes, as it did before, and a unary
  fallback for clients that cannot open a WebSocket is served at
  `/rpc/protocol-builder`. Locks, presence and live updates behave as before; a
  tab whose connection drops keeps its locks for the same reconnect grace. The
  oRPC protocol-builder contract is no longer exported by the boundary package.
- With `STUDIO_TELEMETRY` on, Studio sends an event to Codaco's Studio PostHog
  project as each tracked action happens: a researcher signs up or signs in, an
  invitation is sent or accepted, a member's role changes, a study or protocol is
  created, a protocol draft is committed (with the interface types the protocol
  uses), and an interview starts or completes. These replace periodic counts read
  from the database.

  Each event carries only identifiers Studio minted, fixed codes, counts, booleans
  and a timestamp: never a name, an email address or protocol content. Researchers
  are identified in PostHog by their account id with no person properties.
  Interview events use the participant id that session's usability events already
  use and create no person profile, and a study created with participant analytics
  off sends no interview events at all. Every event carries the installation id, and the team id
  as an ordinary property where it has a team, and is grouped by installation and
  team.

  An action queues its event in its own transaction on the new
  `analytics-delivery` queue, and the worker sends it within seconds. An action
  that rolls back sends nothing, and an event PostHog does not accept is retried
  with backoff for about half a day rather than lost. Each queued event is sent
  with a uuid derived from its job, so PostHog counts a retried delivery once. With telemetry off, nothing
  is queued, and a worker with telemetry off sends nothing it finds queued.

- Studio's own API now runs on Effect's RPC transport. The server serves the
  researcher-facing procedures at `/rpc`, and the web client calls them through a
  typed client built from the same contract, so the two halves can no longer
  disagree about what a procedure takes or returns: a mistake that used to
  surface as a runtime error in a browser is now a compile error.

  What a researcher notices is the error messages. Each procedure declares the
  refusals it can actually produce, and the client branches on those rather than
  on an HTTP status code, so a refusal arrives with its reason intact. The
  clearest case: inviting someone whose invitation is already being sent now says
  so, instead of reporting a conflict. A request whose shape is wrong is refused
  at the boundary rather than part-way through a handler, and a refusal the
  server issues before it reaches a procedure — a rate limit, a maintenance
  window, a request from the wrong origin — reaches the client as that refusal
  rather than as an empty response.

  The tab identity both transports use to own an editing lease now travels in a
  header on the fetch plane and is rewritten into the same header on the
  WebSocket upgrade, so one rule describes it everywhere. The protocol editor
  keeps its existing socket transport.

- Studio encrypts its secrets at rest in the application, and says plainly what it does not. A secret is a value that would let someone act as Studio or as a researcher's integration, and there are three: webhook signing secrets, the API keys researchers store as protocol assets, and OAuth access, refresh and id tokens. All three are now AES-256-GCM ciphertext with the owning row's identity bound in, so one moved to another row stops opening rather than decrypting as that row's secret.

  For a deployer: a keyring is required wherever `DATABASE_URL` is set, as one or more `<id>:<base64 of 32 bytes>` entries whose first is the one new values are written under — from the file named by `STUDIO_SECRETS_KEY_FILE` (the reference stack mounts it as a Compose file secret, so it never reaches `docker inspect` or a log of the environment) or from `STUDIO_SECRETS_KEY`; setting both is refused. Back it up with the database: both processes now refuse to start when a key id stored in the database is one the keyring cannot produce, and name it, so a half-finished rotation or a restore from a backup that does not match the keyring is caught before anything is served rather than one webhook delivery and one sign-in at a time. Losing the keyring loses every stored secret and nothing else — each researcher re-enters an API key, re-links an OAuth account, and each webhook endpoint takes a new signing secret. The image's entrypoint is the `studio-api` dispatcher, so a container names a command: `serve` (the default), `worker`, `migrate`, and now `rotate-secrets`, which re-seals every row under the keyring's current entry in batches, is idempotent, and can be rerun until it reports zero. `migrate` in a deployment and `apply-schema` in a checkout both refuse to run without a keyring, and both check after applying that every stored key id opens under it, so a database restored against the wrong keyring is caught by the command an operator ran rather than by the next container start. A rotation is three steps: add an entry at the front of the keyring and deploy, run the command, then remove the old entry and deploy again.

  For the data: `protocol_asset_keys` is a new table holding one sealed value per API-key asset of a protocol. The key never reaches a section document — it is stripped at the server's write boundary before the document is hashed, a client commit that carries one is refused rather than quietly stripped, and a database trigger refuses any section document holding one — so a key is not at rest in every revision a protocol goes through, and does not travel into the reads that return section documents. Participants, by contrast, now carry plain `email`, `phone`, `name` and `attributes` columns and the messaging tables key on the normalised address, replacing the ciphertext and blind-index columns that were there before: contact details are deliberately not encrypted in the application, on the ruling that encrypting them does not matter while response data is not, and are protected by encrypted volumes, encrypted backups and access control instead. Interview responses and collected networks are likewise not encrypted in the application. The README now states all of this, and the deployment requirements that follow from it, in one place; a test dumps every row of a seeded database and its job schema and asserts no secret appears in it in any encoding.

- Studio's database now carries its whole decided data model rather than only teams and protocols: studies with their waves, participants, interview sessions and links, the collected network (nodes, edges, snapshots and per-session rollups), study roles, consent, scheduling and messaging, team-owned API tokens, asset metadata, templates, webhooks, experiments, feedback, monitoring rollups, and the audit log's staged exports and alert outbox — 32 new tables, every one team-scoped under forced row-level security with the closed-study, finalized-session and participant-erasure rules enforced by database triggers. A fresh Studio instance now seeds itself with synthetic demo data across that model instead of an empty database: a handful of teams with members across every role, studies in every lifecycle state with realistic interview networks, and a fixed admin account (`admin@studio.test` / `studio-admin-not-for-production`) that owns every seeded team and holds a Manager grant on every seeded study. Email/password is now a full third sign-in method alongside magic-link and social — the sign-in screen offers a password form (toggling with magic-link when both are available), and the server accepts it through the real `/api/auth/sign-in/email` endpoint. `pnpm dev` resets and reseeds the database on every boot; the deploy-time `seed` command does the same against any target, refusing a non-local database unless `--force` makes that explicit, matching `db:reset` — and both refuse to give a non-local database the published admin password, taking `STUDIO_SEED_ADMIN_PASSWORD` instead.
- Studio can now be self-hosted from documentation alone. A guide under
  `apps/studio/docs/self-host/` takes an institution from two downloaded files —
  the compose file and the environment example — to a signed-in owner account,
  without a repository checkout and without pnpm, Node or drizzle-kit on the
  host. It covers the requirements a host must meet, backups and restore, the
  upgrade sequence, swapping the database, object store, rate-limit store or
  ingress for the institution's own, and moving between Postgres majors. A
  requirements page states the host sizing, the Docker versions, the ports and
  DNS, the complete list of outbound hosts, and the contract each swapped-in
  service has to meet; the outbound hosts are also a checked-in list, and a test
  refuses to let the two disagree. `apps/studio/docs/topology.md` draws the stack
  and its routing table.

  `pnpm --filter @codaco/studio-api dev:stack` runs that same stack on this
  machine: it builds both images from the checkout, brings up the complete
  compose file on `https://localhost` behind Traefik, runs the `migrate` one-shot
  and hands back its first-run setup token. It exists so the routing table, the
  maintenance page, the first-run screen and an upgrade can be exercised before
  any of them reach someone else's host. `dev:stack:down` stops it, and
  `-- --volumes` wipes its data back to a fresh first run. It runs alongside
  `pnpm dev` rather than instead of it — a separate Compose project, subnet and
  set of ports.

- Studio's study picker now lists and creates real studies instead of protocols. `/team/$teamId` shows each study with its lifecycle state, its participation mode and its wave and participant counts, and creating one writes the study and its protocol line together in a single transaction — so every study has something to design, and the creator receives the study's first Manager grant. Who sees what follows the decided role model: a team Admin or Owner sees every study their team owns, and a team Member sees only the studies they hold a study role on; creating a study is an Admin or Owner action, and a refusal is recorded in the team's activity log alongside the creation itself. A `/study/…` link now opens the study it names from any starting point — the server works out which team owns it from the study identifier alone, rather than the browser having to know, so a bookmark or a shared link opens correctly on a first sign-in that has no team selected yet. The header's study chip names the study instead of showing its identifier and offers the team's other studies, and the protocol editor reaches its draft through the study's protocol rather than treating the study identifier as a protocol identifier.
- Let team owners and admins observe their team's immutable activity record: a permission-checked audit.list/audit.get RPC surface with sequence-cursor pagination and server-rendered event titles, and a team activity screen with category, action, actor, outcome, and date filters, Load more pagination, and an accessible per-event detail view. Members are denied with a committed, rate-limited audit.read_denied event, and events recorded by a newer Studio version render through a safe generic presentation.
- The header's two bespoke switchers are replaced by the shared
  `TeamAndStudySwitcher`, so the team and the study read as one path rather than
  as two controls that happen to sit beside each other.

  The team shown is the one the URL names, falling back to the active-team
  setting only where no route names a team, so the header cannot announce the
  team a researcher is leaving — and that fallback is resolved through the
  membership list, so a setting that outlived its membership names nothing
  rather than offering to administer a team the researcher has left. A team list
  that fails while an earlier one is still in hand goes on offering that one.
  Choosing the team already current does nothing. A researcher who belongs to no
  team gets no segment at all, and a loading list shows a skeleton rather than
  reflowing the header.

  Reporting a team list that could not be read at all belongs to the shell, not
  to the switcher, which shows what it was given and nothing about why.

  The study segment is absent, not empty, on routes that open no study.

  Everything it shows is real. Each study carries its lifecycle state and how
  much of it there is — "Live · 2 waves · 14 participants" — with a dot coloured
  by that state, and the state is in the trigger's accessible name too, so it
  never rests on colour alone. Each team carries the researcher's role in it.
  A study whose team cannot be resolved is named by its identifier and offered
  no siblings, which is what the shell honestly knows about it.

  `me` carries the caller's memberships now — every team they belong to, and
  their role in it — which is why `@codaco/studio-contract` and
  `@codaco/studio-api` are versioned alongside the client. Better Auth's own
  team list joins the member table and then returns only the organization, so
  nothing else could tell the switcher what a researcher is in each of their
  teams. The role travels as a plain string rather than the role enum, because
  a legacy membership is stored as one comma-separated value and an enum would
  fail the whole response over it.

- Studio now exports its logs, traces and metrics while `STUDIO_TELEMETRY` is on,
  which it is by default. They go to Codaco's PostHog project unless
  `OTEL_EXPORTER_OTLP_ENDPOINT` names another OpenTelemetry collector; the new
  `OTEL_EXPORTER_OTLP_HEADERS` supplies that collector's credentials and is
  treated as a secret, and a value `fetch` would not accept as headers is refused
  at boot. With `STUDIO_TELEMETRY=false` no exporter is built. Logs are written to
  stdout either way. The reference compose stack now passes `STUDIO_TELEMETRY`,
  `STUDIO_LOG_LEVEL` and the two OpenTelemetry variables from `.env` to the
  Studio containers; before, setting them in `.env` had no effect.

  Only public data is exported. A request's span records its method, route
  template, final status (including for requests that end in an error) and
  duration, and no longer its URL, query string, headers, user agent or client
  address; a `traceparent` a client sends is ignored. Database spans keep their
  statement text, with placeholders, but not the database host or name. A
  failure is exported as its type and stack frames, never its message. Once the
  installation row exists, every export carries the instance's
  `studio.installation_id`, including those from the `migrate`, `maintenance` and
  `rotate-secrets` commands; a process that starts before `migrate` has created
  the row reads it again after one second, backing off to every thirty, until it
  appears. Each exported log record carries the same `request_id`, `team_id`,
  `trace_id` and `span_id` as the line on stdout.

  Both processes now report event-loop delay (p99 and mean) and memory as
  `studio_runtime_*` gauges every ten seconds.

  A job queued while handling a request is traced as part of that request: the
  job row records the queuing span (migration `0004_job_correlation` adds a
  `correlation` column to the jobs table), and the handler's `JobWorker.handle`
  span is its child. Scheduled jobs carry no correlation.

- Studio now tells researchers when it is down for maintenance. While the server
  answers `503`, a notice above every screen of the app says so, and the screens
  behind it keep asking again at the interval the server's `Retry-After` names,
  for as long as the window lasts, instead of giving up after three tries. A
  screen that could not load at all for the same reason says so rather than
  reporting a generic failure.

  A maintenance window no longer signs anyone out. The session check used to
  read every `503` from `/api/auth` as "this server has no sign-in", so a
  researcher whose tab revalidated during a window was sent to the sign-in page
  and their editor session was closed. Now only the server's own "not
  configured" answer signs them out. Any other `503` keeps them where they are,
  shows the notice (on the sign-in page too), and asks again after
  `Retry-After`. The API marks both answers with a problem `type`:
  `urn:networkcanvas:studio:problem:maintenance` for the maintenance gate and
  `urn:networkcanvas:studio:problem:auth-not-configured` when sign-in is not
  configured.

  A request the server refuses with `401` now signs the researcher out and
  returns them to sign-in, the same way an expired session already did. A read
  refused as forbidden, not found or signed out is no longer retried.

  An address that names a malformed study or team id, such as
  `/study/not-a-study/editor`, now shows the "Page not available" screen without
  asking the server anything, rather than failing inside the screen.

  The protocol editor now loads on its own route. The bundle loaded for every
  other screen is 803 kB gzipped, down from 1,977 kB, and only the British
  English protocol-editor messages Studio uses are bundled, not every language
  the editor ships.

  `/rpc` no longer provides the unused `ClientSessionMiddleware`, the client no
  longer sends `x-studio-client-session` on `/rpc` requests (the tab is still
  named on the editor's socket), and
  `@codaco/studio-contract` no longer exports `./middleware/client-session`.
  `StudioStreams` is no longer re-exported from `./rpc/studio`; import it from
  `./sync/protocol-builder`.

### Patch Changes

- The protocol editor now checks a researcher's team role and study grants at
  the moment of every call it serves, not only of the edits. Reading a section,
  listing sections or resources, inspecting or previewing a resource, staging or
  discarding one, opening a watch, answering a retried submit or create, and
  giving a lock back are all refused once the researcher has been removed from
  the team or lost the grant that let them reach the protocol, even when that
  happened after the call opened its session. A refused watch never shows the
  researcher to colleagues as present, an open watch re-reads the role and grants
  when it reauthorizes, and a committed API key is read in the same transaction
  as the check that allows it. A removed researcher's locks are still given back
  when their connection drops. `protocols.list`, `studies.list`, `studies.get` and
  `studies.counts` likewise decide what to show from the role they read inside
  the same transaction as the data they return.

  The audit log records a denial only when the command failed with one: a
  denial marker carried by an unexpected server fault no longer writes a denied
  event. A denied audit-log read that the denied-attempts window suppresses is no
  longer reported to the operator as a lost denial event.

  `DATABASE_URL` can now name a private certificate authority: Studio's database
  client reads the certificate in `sslrootcert`, and a client certificate in
  `sslcert` and `sslkey`, so a database whose certificate comes from an
  institution's own authority connects without adding it to the image's trust
  store or setting `NODE_EXTRA_CA_CERTS`. The server's certificate and hostname
  are still verified in every TLS mode. `sslmode=prefer` and `sslmode=allow` are
  still refused at boot, since either can connect without TLS, and any other
  `sslmode` Studio does not know is refused as unsupported.

- The web process and the worker print a refusal to start as the one sentence to
  act on, as `migrate`, `maintenance` and `rotate-secrets` already did, and still
  exit 1. This keeps the promise stage 1's changeset made ("boot failures still
  print a plain message"): a keyring that cannot read the database, a worker with
  no database, or an environment Studio
  refuses (for example both `STUDIO_SECRETS_KEY` and `STUDIO_SECRETS_KEY_FILE`
  set) no longer arrive wrapped in Effect's `ERROR (#1): <Tag>: …` report with a
  stack trace.

  A failure that is not a refusal, where something broke rather than refused,
  still prints its stack, in every Studio process. The one-shot commands used to
  print only its message.

- The protocol editor runs on the `@codaco/protocol-builder` host contract. The
  screen used to build its own editing session — a lease it renewed on a timer,
  a command queue, and a form of its own holding a screen name and a page
  heading — and to draw undo, redo and a pending-change count beside it. All of
  that belonged to a collaboration model the package no longer has: one editor
  holds a screen while it is open, so the package owns the form, submits the
  whole screen, and needs none of it.

  The screen now mounts the package's own editor for whichever interface the
  selected screen is, over one channel per open protocol. Studio keeps what is
  Studio's: the outline and its reordering, the section selector, the validation
  panel, and the save control — which is rendered through the editor's action
  slot and still asks before unsaved values are discarded.

  With the editing session gone, so are the RPC procedures only it called:
  `protocols.acquireSection`, `commitSection`, `renewSection` and
  `releaseSection`, their input and result schemas, and the command-patch wire
  format they carried. Sections are locked and written through `protocolBuilder`
  alone, which takes a whole section document rather than a list of commands, so
  there is no second way to write a draft and no second lock model to keep in
  step with the first. The audit properties those procedures carried — the event
  a write records, that a retried write records no second one, that no
  researcher value reaches the audit details, and that a failed audit insert
  rolls the write back with it — are asserted against `protocolBuilder.submit`
  instead of being dropped.

- Closes the items the Effect 4 migration (#1927) carried forward without an
  owning issue.

  - The general `/rpc` mount reads at most the contract's unary body bound,
    as `/rpc/protocol-builder` already did. A caller with no session could
    send an unbounded body before being refused.
  - A stopping server closes every open `/ws` socket with 1001 ("going away")
    rather than the 1000 that Effect 4 sends for a handler that merely
    returned; the editor reconnects on either.
  - A schedule row whose stored payload no longer decodes, or that names a
    queue this build does not declare, is logged and skipped on its tick,
    instead of ending the tick and rolling back every other due schedule with
    it (#1996). The row stays due, so the occurrence runs once boot repairs it.
  - The sign-in page's `invitationId` guard now holds: an id that is not a
    team invitation id is dropped before the magic link's return address is
    built, where before it reached the link verbatim.
  - The asset-key re-seal is pinned to the row's own team and protocol by a
    rotation test that shares one asset id across protocols and teams.
  - No `session.cookieCache` is adopted, by recorded decision: the session is
    read on every call so that revocation takes effect at once.

- The environment declaration moves to Effect Schema v4.

  `src/env/schema.ts` says the same things in Effect 4's vocabulary: exact
  optional fields are `Schema.optionalKey`, refinements are `check`s, the two
  transformed variables are built with `decodeTo`, and a refusal message is a
  plain string that replaces what Effect would have composed. What a deployer
  sees is unchanged — a bad environment still names every offending variable in
  one report, still says what each value must be, and still never prints the
  value it rejected. `.env.development`, `.env.example` and the README's
  environment table generate byte-for-byte as before.

  Two details changed because Effect 4's schema AST did. The documentation each
  variable carries is keyed by namespaced strings rather than symbols, because
  v4's annotation record is string-keyed; and it is read back from the schema
  node and its checks together, because `annotate` on a schema that carries
  checks attaches to the last check rather than to the node.

  `Environment` is a `Context.Service` under the id `@studio/Environment`, with
  `layer` and `layerWithMail` unchanged. `readEnv()` is unchanged for its
  callers.

  Separately, the reference compose stack gives the worker 40 seconds to stop.
  No service set `stop_grace_period`, so Docker was sending SIGKILL after its
  default 10 seconds while the worker's documented drain takes 25–30 — long
  enough that a redeploy could kill a job mid-flight.

- After maintenance mode ends or a migration releases its lock, the API and the
  job worker stay closed until they have read the database schema again. Before,
  a schema read that failed or was slow straight after a migration answered the
  value from before it, so a process built for the old schema could reopen on
  the new one. While that read keeps failing, readiness reports "the schema has
  not been read since maintenance mode or a migration".
- Job payloads are declared once, on Effect Schema. `@codaco/studio-sync/jobs`
  now declares every queue's payload as a `Schema.Struct` in
  `JOB_PAYLOAD_SCHEMAS`, beside `JOB_PAYLOAD_PARSE_OPTIONS`, and the server's
  queue decodes through those rather than a second set of its own. The payload
  policy is unchanged: a job carries row identifiers only, with sign-in email the
  one documented exception, and a payload with a field its queue does not declare
  is refused on enqueue and killed on claim rather than having the field dropped.

  The sweep and denied-attempts summary queues now refuse any payload but an
  empty object. Their previous declaration admitted any value that was not null
  and kept an undeclared key as it was sent.

- An author keeps the section they are editing when the API restarts.

  The process that granted an edit lock was the only thing renewing it, so after
  a restart nothing kept it alive and it expired within 30 seconds. The editor
  still showed the section as the author's, and their next save was refused and
  the form reset. Now, when the editor's live connection comes back, the server
  renews every lock that browser tab still holds and keeps renewing it. A lock
  that has already expired is not revived, and another author's lock is never
  touched.

- Update third-party dependencies to their latest minor and patch releases, including better-auth 1.7.6, nodemailer 10.0.13 and TanStack Router 1.170.40.
- Fix the Netlify deployment answering every request with the client's "server could not be reached" screen. The lane is documented to run with no database and auth off, because a deploy preview's per-PR origin can never match PUBLIC_URL — but that rested on the Netlify site not defining DATABASE_URL, which nothing enforced. With a database configured but unusable from the function, better-auth failed the session lookup with a 500 and the CSRF gate refused the preview's own requests. The Netlify entrypoint now drops both surfaces itself, so the documented degradation is what runs: sign-in reports that it is unavailable on this server instead of the app replacing itself with an error screen.
- Upgrade nodemailer to 10.0.9. The 9.x line carried four advisories against the version the worker was sending with — a quadratic address parser that a crafted recipient list could use for denial of service, two recipient-domain validation bypasses (an RFC 5322 comment and an IDN/Punycode allow-list case), and a `resolveContent()` path that ignored the file and URL access policy — all fixed from 9.1.1 on. nodemailer 10 also ships its own type declarations, so the separate types package goes, and it applies the timeouts set beside a connection `url`, which lets the worker's SMTP transport be built the plain way again.
- Participants can now take an interview in Studio. Opening an interview link
  starts or resumes the participant's session and runs the interview; answers
  and the stage reached are saved as the participant goes, with a last save sent
  as the page is closed. Reopening a participant's own link in the same browser
  returns to their session, and reloading the page keeps it. An anonymous link
  resumes only in the tab it was opened in, so the next person on a shared
  device starts their own interview. Finishing shows a notice that the interview
  is complete, and the same notice greets a participant who reopens a finished
  interview. A link that cannot be used says why: it was not recognised, has
  expired or been withdrawn, the study is not open, paused or closed, or the
  interview is open in another window; an interview whose link was opened again
  elsewhere asks the participant to open their link to continue. Participant
  pages send no cookies with their requests and never ask who is signed in.
- Take the protocol-authoring contract from `@codaco/protocol-builder-core`
  rather than `@codaco/protocol-builder`. The contract, its schemas and its typed
  errors are unchanged — they now live in a package with no React and no
  `@codaco/fresco-ui` in its dependency closure, so a change to the stage
  editors' UI no longer invalidates the server's build and test selection.
- Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. A section lock belongs to the browser tab that took it rather than to the socket that carried the call: the client mints an id once per page load and sends it as a header on every `/rpc` call, and the server reads the same id off a `/ws` upgrade URL, because a browser cannot put a header on a handshake. It is never persisted, because a browser copies `sessionStorage` into a duplicated tab and two documents naming one owner would both be granted the same section. So two tabs of one researcher are two owners and the second opens read-only behind the first, but a tab whose socket drops is the same tab when it reconnects and still holds the section it has open. A tab that never comes back gives its sections up, with the lock events that say so, once the reconnect grace is out. A write that has to change a section it holds no lock on is refused naming who holds it: a create while an editor has the stage index open, and a write promoting resources while one has the asset manifest open, since that editor's next whole-section submit would take the new pointer or the new manifest entry straight back out. A create takes a promotion of its own, for the reason a submit cannot cover — a stage being added can carry a file imported while it was composed, and there is no earlier revision of it to promote with — so the section, its pointer and the manifest entries land in one revision or not at all. A retried write is answered with what its first attempt committed rather than writing again, which for a create means the stage it already made rather than a second copy: every submit and every create carries an idempotency key of its own, and the receipt for it is written in the same transaction as the revision it describes, so the answer survives a restart — the client whose answer went missing is exactly the client reconnecting to a server that came back up. Staged resources belong to the edit that imported them rather than to the connection, because one researcher can have a codebook dialog open over a stage editor: neither one's cancel takes away the file the other is about to submit, and neither one's submit promotes what the other imported. Promoted bytes are committed under their content hash, so two imports of different files sharing a filename stay two assets, while the manifest still records the name the researcher gave them. Deleting a stage other stages depend on is refused naming where they name it, rather than silently rewriting a collaborator's skip logic as a side effect. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read — including the stage dependants a deletion is refused for, derived from the protocol schema's own stage-reference tags — and exports the per-section shape check they had each written for themselves.
- Studio's rate limits are constants with a single source of truth, not settings.

  All eleven — sign-in per client address and per email address, invitation
  acceptance, the two participant-redemption scopes and participant sync, RPC per
  user and per team, storage reads, the public data API, and WebSocket upgrades —
  are now defined in one file, `server/src/rate-limit/scopes.ts`, each with its
  count, its window, and why that number rather than another. The eleven
  `RATE_LIMIT_*` environment variables that used to override them at boot are
  removed, along with their entries in `.env.example`, the environment table, and
  the development environment file.

  A rate limit is a security default rather than a capacity setting: one a
  deployer can raise is one an attacker meets only where nobody raised it, and the
  instance that raised it is the one that fails silently. Changing a limit is now
  a code change, in a single file, which is what makes it reviewable.

  `REDIS_URL` is unchanged, and remains the only part of rate limiting a
  deployment configures: it says where the counters live.

- The stored-secret check and `rotate-secrets` run as Effects over the process's
  own keyring and cipher (stage 6 of the Effect 4 migration, #1927). What a
  deployment sees:

  - The web process, the worker, `migrate` and `apply-schema` refuse a database
    whose stored secrets the keyring cannot open on the same three conditions, in
    the same order, as before. The web process and the worker run the check as a
    gate beneath the listener and the job queue, on a maintenance connection that
    is closed before either starts.
  - `rotate-secrets` logs each committed batch as a JSON line, like every other
    Studio log, rather than as a plain line. Its closing summary and exit codes
    are unchanged: 0 when every row is under the current entry, 1 when it
    refuses or could not prove every row rotated, 130 when interrupted, with
    every committed batch kept.
  - `migrate`, `maintenance` and `rotate-secrets` now print why they refused an
    environment they could not read (for example both `STUDIO_SECRETS_KEY` and
    `STUDIO_SECRETS_KEY_FILE` set). They exited 1 in silence before.

- The self-host stack is tested. `apps/studio/stack-test` stands the reference
  deployment up from the compose file a self-hoster downloads, drives the whole
  of it — the routing table, the WebSocket upgrade, first-run setup with the
  token `migrate` prints, an asset written and read back, the maintenance page
  while the API is stopped, and being refused by its own sign-in limit — and then
  does the same for each documented swap with the swapped element replaced by a
  stub on a network of its own: a managed database, a managed bucket, an external
  Redis, and an institution's own reverse proxy. Every
  variant is held to the same contract, so a swap is proved by the same
  assertions passing rather than by a shorter list. CI runs it as the
  `studio-stack` job whenever the images, the compose files, the environment
  template, the scripts or the self-host guide change.

  The ingress variant reads its nginx configuration out of the guide at run time
  rather than from a copy, which found three things wrong with what the guide
  asks an institution to do.

  An instance behind that proxy was dead after every upgrade. Replacing the API
  container gives it a new address, and nginx looked the name up once when it
  loaded its configuration, so it went on addressing a container that was gone
  and answered 502 until somebody reloaded it — which nothing told anyone to do.
  The upgrade sequence now says to, at the step that causes it, and the ingress
  swap says why.

  The maintenance page could also arrive far too late or not at all. A stopped
  API container takes its address with it, so the proxy's connection attempt goes
  unanswered rather than being refused — between 3 and 30 seconds, against an
  nginx default of 60 — and once that attempt is bounded it ends as a 504, which
  the example did not answer as the page. It now bounds the connect and answers
  504 as 503 alongside 502.

  Finally, the guide told operators to list only proxies that overwrite
  `X-Forwarded-For` while showing an example that appends. The example is right:
  Studio reads the chain from the right and stops at the first address that is
  not a listed proxy, so a client's own entry is never reached. The rule now says
  what actually keeps it safe, which is listing every proxy a request passes
  through and nothing else.

- With telemetry on, Studio's processes now keep writing each log record to
  stdout as Studio's JSON line, with its request, team, trace and span ids, beside
  exporting it. Before, turning telemetry on replaced that logger with Effect's
  default text logger and a logger that copied every record, failure text
  included, onto the current span as an event, so the failure text left the
  instance with the exported trace. Log records are no longer copied onto spans,
  and a span event's `effect.cause` is dropped before export.

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`, and grants the connecting login the right to assume them; the server's pool starts every session as `studio_app`, which cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else. The single `DATABASE_URL` is unchanged, but the login it names must hold `CREATEROLE` the first time the schema is applied.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
