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

- Studio's background work moves onto pg-boss and into a process of its own. One image, two commands: `node dist/index.js` still serves HTTP, the RPC surface and the WebSocket endpoint and may now only create jobs, while `node dist/worker.js` (`start:worker`) runs the jobs and the cron schedules and binds no port — a deployment starts it as a second container from the same image, with `--no-healthcheck`, because the worker deliberately does not serve `/healthz`. `pnpm dev` runs both. Sending mail is the worker's alone: `SMTP_URL` and `EMAIL_FROM` are read by that process and withheld from the web process, sign-in and team-invitation email is queued by the request and sent by the worker, and a worker with no transport configured still boots, runs the rest of its work, and says at error level that mail is waiting. Creating a team invitation while nothing can deliver it therefore queues the message and sends it when a worker with mail returns, instead of refusing with `SERVICE_UNAVAILABLE`. Protocol-store garbage collection, which existed but had nothing running it, now runs hourly on the worker's cron. The SMTP transport's timeouts are also real for the first time — nodemailer discards options passed beside a connection URL, so every send had been using its defaults of two minutes to connect and thirty seconds for a greeting — which is what lets a send that is in flight when a container stops finish, or fail, inside the worker's shutdown window rather than being abandoned mid-attempt. Every job is created inside the transaction that caused it, so a command that rolls back leaves no job behind and a command that commits always leaves exactly one.

  For the database: `apply-schema` now installs pg-boss's own `pgboss` schema from pg-boss's construction plan and creates or updates every queue Studio declares, and the fingerprint every process verifies at boot covers that plan, the grants beside it, and the queue declarations — so a pg-boss upgrade, or a change to a queue's retry, expiry or dead-letter settings, is a schema change like any other: applied once by `apply-schema`, and refused by every process until it has been. No process migrates pg-boss at start. Pre-release, a database whose installed pg-boss version is not this build's is dropped and reinstalled rather than migrated, which discards whatever was queued in it; `apply-schema` reports how many jobs that was. The application role may create a job and nothing else with it — it cannot read, retry, cancel or delete one — and the five outbox-shaped tables lose the `available_at`, `lease_owner` and `lease_expires_at` columns along with the hand-written dispatcher that used them, keeping their terminal state, attempt count and error record.

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

### Patch Changes

- Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. A section lock belongs to the browser tab that took it rather than to the socket that carried the call: the client mints an id once per page load and sends it as a header on every `/rpc` call, and the server reads the same id off a `/ws` upgrade URL, because a browser cannot put a header on a handshake. It is never persisted, because a browser copies `sessionStorage` into a duplicated tab and two documents naming one owner would both be granted the same section. So two tabs of one researcher are two owners and the second opens read-only behind the first, but a tab whose socket drops is the same tab when it reconnects and still holds the section it has open. A tab that never comes back gives its sections up, with the lock events that say so, once the reconnect grace is out. A write that has to change a section it holds no lock on is refused naming who holds it: a create while an editor has the stage index open, and a write promoting resources while one has the asset manifest open, since that editor's next whole-section submit would take the new pointer or the new manifest entry straight back out. A create takes a promotion of its own, for the reason a submit cannot cover — a stage being added can carry a file imported while it was composed, and there is no earlier revision of it to promote with — so the section, its pointer and the manifest entries land in one revision or not at all. A retried write is answered with what its first attempt committed rather than writing again, which for a create means the stage it already made rather than a second copy: every submit and every create carries an idempotency key of its own, and the receipt for it is written in the same transaction as the revision it describes, so the answer survives a restart — the client whose answer went missing is exactly the client reconnecting to a server that came back up. Staged resources belong to the edit that imported them rather than to the connection, because one researcher can have a codebook dialog open over a stage editor: neither one's cancel takes away the file the other is about to submit, and neither one's submit promotes what the other imported. Promoted bytes are committed under their content hash, so two imports of different files sharing a filename stay two assets, while the manifest still records the name the researcher gave them. Deleting a stage other stages depend on is refused naming where they name it, rather than silently rewriting a collaborator's skip logic as a side effect. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read — including the stage dependants a deletion is refused for, derived from the protocol schema's own stage-reference tags — and exports the per-section shape check they had each written for themselves.

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`, and grants the connecting login the right to assume them; the server's pool starts every session as `studio_app`, which cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else. The single `DATABASE_URL` is unchanged, but the login it names must hold `CREATEROLE` the first time the schema is applied.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
