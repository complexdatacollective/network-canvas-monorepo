# @codaco/studio-server

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

  Local development is one command. `pnpm --filter @codaco/studio-server dev`
  brings up the same stack's Postgres, Garage, Valkey and a Mailpit sink,
  bootstraps the bucket, resets and seeds the database, and runs the server, the
  worker and the client together; `dev:down` stops it. The hand-rolled
  `dev-pg`/`dev-s3` containers and MinIO are gone, sign-in mail is delivered
  through Mailpit rather than printed to the console, and a new
  `STUDIO_TELEMETRY` variable carries the development opt-out ahead of the
  reporting it will govern.

- Upgrade better-auth to 1.7.5 and key accounts the way it does again. 1.7.0 through 1.7.2 matched a credential or OAuth account on an extra `issuer` column, so the schema carried one and made it required; 1.7.3 reverted to the 1.6 behaviour, where `(providerId, accountId)` is the whole identity, and refuses to start against a schema that still demands a column it never writes. The column and its unique index go, replaced by a unique index on `(providerId, accountId)` — the pair every account lookup now matches on, and the one better-auth itself refuses to disambiguate if two rows share it. The development seed writes both its credential and its linked-Google account without the column, the auth adapter's own suite matches accounts the way better-auth now does, and the schema fingerprint moves with it, so an existing development database is re-provisioned on next boot.
- Studio now ships as two container images instead of one. `studio-api` carries
  the server, and its entrypoint chooses the process: `serve` for HTTP, RPC and
  the WebSocket endpoint, `worker` for background jobs, and `migrate`, which
  creates the schema in an empty database from statements the build renders — so
  a deployment no longer needs a repository checkout to provision one.
  `maintenance on|off` and `rotate-secrets` are named but not yet implemented and
  exit with a message saying so. `studio-web` is nginx serving the built client,
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
  store, and, on the worker, the pg-boss connection — and answers 503 naming the
  one that failed. The worker serves them on a loopback-only listener, on the new
  `WORKER_HEALTH_PORT` (default 3001), so a container healthcheck can ask a
  process that answers nothing else whether it is working.

  The protocol store now keeps an unreferenced section for three days rather than
  one, so the window always exceeds the daily backup interval.

- Distinguish the two topologies one Studio artifact serves. `STUDIO_DEPLOYMENT_MODE` (`managed` | `self-hosted`, unset ⇒ `self-hosted`) selects which URL paths a deployment has, from a classification shared by both deployables: the managed-only marketing, pricing, sign-up and billing paths are refused with a real HTTP 404 on a self-hosted instance, and first-run `/setup` is refused on the managed service, so no tenant reaches instance configuration. The refusal still returns the app shell, so the client renders its branded not-found state behind an honest status line, and `Cache-Control: no-store` keeps nothing caching it. `/` is served in both, because a self-hoster's origin root is the URL they hand their researchers. The `status` procedure now reports the mode, and the static-asset wiring moves out of the server entrypoint into `mountClient`.
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
  `apps/studio/server/src/**`, together with a ban on importing `node:process`,
  because the linter only sees `process.env` reached through the global.

  Beside `readEnv` there is an `Environment` service (an Effect `Context.Tag` and
  a `Layer`), which nothing consumes yet and which is the sanctioned way in for
  the first part of the server that runs under Effect.

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

- Studio's background work moves onto pg-boss and into a process of its own. One image, two commands: `node dist/index.js` still serves HTTP, the RPC surface and the WebSocket endpoint and may now only create jobs, while `node dist/worker.js` (`start:worker`) runs the jobs and the cron schedules and binds no port — a deployment starts it as a second container from the same image, with `--no-healthcheck`, because the worker deliberately does not serve `/healthz`. `pnpm dev` runs both. Sending mail is the worker's alone: `SMTP_URL` and `EMAIL_FROM` are read by that process and withheld from the web process, sign-in and team-invitation email is queued by the request and sent by the worker, and a worker with no transport configured still boots, runs the rest of its work, and says at error level that mail is waiting. Creating a team invitation while nothing can deliver it therefore queues the message and sends it when a worker with mail returns, instead of refusing with `SERVICE_UNAVAILABLE`. Protocol-store garbage collection, which existed but had nothing running it, now runs hourly on the worker's cron. The SMTP transport's timeouts are also real for the first time — nodemailer discards options passed beside a connection URL, so every send had been using its defaults of two minutes to connect and thirty seconds for a greeting — which is what lets a send that is in flight when a container stops finish, or fail, inside the worker's shutdown window rather than being abandoned mid-attempt. Every job is created inside the transaction that caused it, so a command that rolls back leaves no job behind and a command that commits always leaves exactly one.

  For the database: `apply-schema` now installs pg-boss's own `pgboss` schema from pg-boss's construction plan and creates or updates every queue Studio declares, and the fingerprint every process verifies at boot covers that plan, the grants beside it, and the queue declarations — so a pg-boss upgrade, or a change to a queue's retry, expiry or dead-letter settings, is a schema change like any other: applied once by `apply-schema`, and refused by every process until it has been. No process migrates pg-boss at start. Pre-release, a database whose installed pg-boss version is not this build's is dropped and reinstalled rather than migrated, which discards whatever was queued in it; `apply-schema` reports how many jobs that was. The application role may create a job and nothing else with it — it cannot read, retry, cancel or delete one — and the five outbox-shaped tables lose the `available_at`, `lease_owner` and `lease_expires_at` columns along with the hand-written dispatcher that used them, keeping their terminal state, attempt count and error record.

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

  `pnpm --filter @codaco/studio-server dev:stack` runs that same stack on this
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
  their role in it — which is why `@codaco/studio-rpc` and
  `@codaco/studio-server` are versioned alongside the client. Better Auth's own
  team list joins the member table and then returns only the organization, so
  nothing else could tell the switcher what a researcher is in each of their
  teams. The role travels as a plain string rather than the role enum, because
  a legacy membership is stored as one comma-separated value and an enum would
  fail the whole response over it.

### Patch Changes

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

- Fix the Netlify deployment answering every request with the client's "server could not be reached" screen. The lane is documented to run with no database and auth off, because a deploy preview's per-PR origin can never match PUBLIC_URL — but that rested on the Netlify site not defining DATABASE_URL, which nothing enforced. With a database configured but unusable from the function, better-auth failed the session lookup with a 500 and the CSRF gate refused the preview's own requests. The Netlify entrypoint now drops both surfaces itself, so the documented degradation is what runs: sign-in reports that it is unavailable on this server instead of the app replacing itself with an error screen.
- Upgrade nodemailer to 10.0.9. The 9.x line carried four advisories against the version the worker was sending with — a quadratic address parser that a crafted recipient list could use for denial of service, two recipient-domain validation bypasses (an RFC 5322 comment and an IDN/Punycode allow-list case), and a `resolveContent()` path that ignored the file and URL access policy — all fixed from 9.1.1 on. nodemailer 10 also ships its own type declarations, so the separate types package goes, and it applies the timeouts set beside a connection `url`, which lets the worker's SMTP transport be built the plain way again.
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

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`, and grants the connecting login the right to assume them; the server's pool starts every session as `studio_app`, which cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else. The single `DATABASE_URL` is unchanged, but the login it names must hold `CREATEROLE` the first time the schema is applied.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
