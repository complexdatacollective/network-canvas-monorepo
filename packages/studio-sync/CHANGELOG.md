# @codaco/studio-sync

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

- Studio now serves the four calls a participant's browser makes during an interview: redeeming a link, reading the session, saving answers as they are given, and finishing. No participant page uses them yet.

  Redeeming a link refuses one that is revoked or expired, a study that is draft, paused or closed, and a wave that has not opened or has closed, each with its own reason. A managed participant always returns to their one session in the wave, and redeeming their link again replaces the session's address; an anonymous link starts a new session each time. Redeeming the link of a finished interview says so. Redemption is rate-limited per address, and a participant's own link is also limited on its own; an anonymous study's shared link is not, so a whole study can start at once.

  The session read returns the protocol the session is pinned to, including its API keys, and the network collected so far, and takes the session over for the page that asks. Session reads are rate-limited per session. Answers are saved as rows: each save replaces the session's nodes and edges with what the browser holds, a replayed save changes nothing, and a page that has been taken over is refused. While a study is paused, interviews already under way can continue for the study's grace period before they are stopped.

  Finishing marks the session complete and stores its immutable snapshot in the same transaction, after which the interview can no longer be changed. A finish from a browser holding answers the server has not yet saved is refused as out of date, so the browser can save them and finish again rather than leave them out of the snapshot. A completion job is queued for the webhooks still to come. Team activity records "Interview started" and "Interview completed" for each participant.

- Studio's background work moves onto a job queue of its own, written on Effect, and into a process of its own. One image, two commands: `node dist/index.js` still serves HTTP, the RPC surface and the WebSocket endpoint and may now only create jobs, while `node dist/worker.js` (`start:worker`) runs the jobs and the cron schedules and binds no port — a deployment starts it as a second container from the same image, with `--no-healthcheck`, because the worker deliberately does not serve `/healthz`. `pnpm dev` runs both. Sending mail is the worker's alone: `SMTP_URL` and `EMAIL_FROM` are read by that process and withheld from the web process, sign-in and team-invitation email is queued by the request and sent by the worker, and a worker with no transport configured still boots, runs the rest of its work, and says at error level that mail is waiting. Creating a team invitation while nothing can deliver it therefore queues the message and sends it when a worker with mail returns, instead of refusing with `SERVICE_UNAVAILABLE`. Protocol-store garbage collection, which existed but had nothing running it, now runs hourly on the worker's cron. The SMTP transport's timeouts are also real for the first time — nodemailer discards options passed beside a connection URL, so every send had been using its defaults of two minutes to connect and thirty seconds for a greeting — which is what lets a send that is in flight when a container stops finish, or fail, inside the worker's shutdown window rather than being abandoned mid-attempt. Every job is created inside the transaction that caused it, so a command that rolls back leaves no job behind and a command that commits always leaves exactly one.

  For the database: `apply-schema` and `studio-api migrate` install the queue's own schema, `studio_jobs` — two tables, their indexes, a trigger that announces a new job to any listening worker with `NOTIFY` on commit, and grants that let the application role create a job and nothing else with it — and the fingerprint every process verifies at boot covers that DDL, so a change to it is a schema change like any other: applied once, and refused by every process until it has been. Each queue's retry ladder, lease and retention are declared in `@codaco/studio-sync/jobs` and frozen onto a job's row when it is created, so a redeploy does not change the retries of work already queued. The five outbox-shaped tables lose the `available_at`, `lease_owner` and `lease_expires_at` columns along with the hand-written dispatcher that used them, keeping their terminal state, attempt count and error record.

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

- A section command can now address a value nested inside a section document, not
  only a top-level key of it. A list a stage keeps somewhere other than the top
  level — a Family Pedigree's family-member form at `nodeConfig.form` — is edited
  with the document's own `insertItem`/`removeItem`/`moveItem`, so an editor and a
  collaborator working on the same list can merge their changes to it instead of
  replacing each other's whole node configuration.

  The new address form is an array of object keys (`["nodeConfig", "form"]`);
  a top-level key is still written as the bare string it always was, so every
  command already in a command log means exactly what it meant before. A server
  built before this change refuses a nested command outright rather than reading
  it as a key that happens to contain a dot. Array indices are deliberately not
  addressable: a position stops meaning the same thing as soon as anything inserts
  a row above it.

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

### Patch Changes

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
- Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. A section lock belongs to the browser tab that took it rather than to the socket that carried the call: the client mints an id once per page load and sends it as a header on every `/rpc` call, and the server reads the same id off a `/ws` upgrade URL, because a browser cannot put a header on a handshake. It is never persisted, because a browser copies `sessionStorage` into a duplicated tab and two documents naming one owner would both be granted the same section. So two tabs of one researcher are two owners and the second opens read-only behind the first, but a tab whose socket drops is the same tab when it reconnects and still holds the section it has open. A tab that never comes back gives its sections up, with the lock events that say so, once the reconnect grace is out. A write that has to change a section it holds no lock on is refused naming who holds it: a create while an editor has the stage index open, and a write promoting resources while one has the asset manifest open, since that editor's next whole-section submit would take the new pointer or the new manifest entry straight back out. A create takes a promotion of its own, for the reason a submit cannot cover — a stage being added can carry a file imported while it was composed, and there is no earlier revision of it to promote with — so the section, its pointer and the manifest entries land in one revision or not at all. A retried write is answered with what its first attempt committed rather than writing again, which for a create means the stage it already made rather than a second copy: every submit and every create carries an idempotency key of its own, and the receipt for it is written in the same transaction as the revision it describes, so the answer survives a restart — the client whose answer went missing is exactly the client reconnecting to a server that came back up. Staged resources belong to the edit that imported them rather than to the connection, because one researcher can have a codebook dialog open over a stage editor: neither one's cancel takes away the file the other is about to submit, and neither one's submit promotes what the other imported. Promoted bytes are committed under their content hash, so two imports of different files sharing a filename stay two assets, while the manifest still records the name the researcher gave them. Deleting a stage other stages depend on is refused naming where they name it, rather than silently rewriting a collaborator's skip logic as a side effect. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read — including the stage dependants a deletion is refused for, derived from the protocol schema's own stage-reference tags — and exports the per-section shape check they had each written for themselves.

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`, and grants the connecting login the right to assume them; the server's pool starts every session as `studio_app`, which cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else. The single `DATABASE_URL` is unchanged, but the login it names must hold `CREATEROLE` the first time the schema is applied.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
