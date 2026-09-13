# @codaco/studio-server

## 0.3.0

### Minor Changes

- Encrypt participant contact fields and OAuth/webhook credentials with versioned keys, require immutable audits for protected reads, and verify durable key evidence before server startup. Add bounded operator commands for key verification, resumable rotation, and legacy credential conversion, with real PostgreSQL backup/restore coverage.

  Protect retained upgrade plaintext from both runtime roles, require separate operator credentials for offline conversion, audit credential deletions atomically across unlink and user cascades, and keep resumed maintenance pages bounded without repeated corpus scans.

  Restrict runtime account writes to the same nonlegacy column projection as reads, including NULL/default clearing and insert/upsert paths, and require bounded conversion plus full verification before restarting an upgraded deployment.

  Contain authentication provider and database failures before framework error logging or response bodies can expose private diagnostics.

- Add sanitized Studio error reporting through the existing Network Canvas relay, with one runtime telemetry setting that defaults on for managed and self-hosted deployments. Setting it to false prevents browser and server SDK initialization and telemetry traffic. Error reports omit personal information and protocol content, and fatal reporting preserves the server's bounded shutdown behavior.
- Add configurable researcher activity alerts for participant contact access,
  integration credential activity, and repeated access denials. Alerts can be
  delivered in Studio or by the configured email transport, recheck current
  membership and preferences before delivery, and preserve interrupted email
  handoffs as visible uncertainty without automatically resending them.
- Distinguish the two topologies one Studio artifact serves. `STUDIO_DEPLOYMENT_MODE` (`managed` | `self-hosted`, unset ⇒ `self-hosted`) selects which URL paths a deployment has, from a classification shared by both deployables: the managed-only marketing, pricing, sign-up and billing paths are refused with a real HTTP 404 on a self-hosted instance, and first-run `/setup` is refused on the managed service, so no tenant reaches instance configuration. The refusal still returns the app shell, so the client renders its branded not-found state behind an honest status line, and `Cache-Control: no-store` keeps nothing caching it. `/` is served in both, because a self-hoster's origin root is the URL they hand their researchers. The `status` procedure now reports the mode, and the static-asset wiring moves out of the server entrypoint into `mountClient`.
- Load encryption roots through AWS KMS with explicit key and authenticated context binding, isolated credentials, bounded startup requests, and the existing historical-key verification gate. The same optional loader is available in managed and self-hosted deployments.
- Researchers can have a language preference stored on their account, so the
  language they choose follows them to any device they sign in on rather than
  living only in the browser that set it.

  The preference is optional: an account that has never chosen one has no
  stored value, and the interface falls back to the languages the browser asks
  for. Only languages Studio actually supports can be stored.

- Add Postmark as a configurable Studio email transport alongside SMTP. Sign-in
  and invitation email share single-recipient validation, bounded delivery waits,
  disabled tracking, and private diagnostic errors. Ambiguous provider outcomes
  stop automatic retries so a possibly accepted message is not sent again.
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

- Add protected operational metrics, bounded dependency readiness, and structured request diagnostics that omit research payloads and secrets. Correlate HTTP responses with immutable audit events using validated request IDs.
- Support complete database backups through separately held read-only credentials. A dedicated backup role can read every tenant and migration record without superuser or row-security bypass privileges. The explicit backup verification command refuses incomplete row policies, unsafe role grants, writable objects and mismatched schemas before an operator captures a backup. Exhaustive stored-key custody verification uses a dedicated five-minute bound while structural checks retain their ten-second fail-closed deadline.
- Run Studio as a combined service or separate web and worker processes. Web startup refuses a second replica, and shutdown stops new delivery claims while active requests and WebSockets drain. Runtime database roles can read schema readiness without changing migration evidence. Completed self-hosted setup now permanently returns not found and sends the new owner to sign-in.
- Studio's database now carries its whole decided data model rather than only teams and protocols: studies with their waves, participants, interview sessions and links, the collected network (nodes, edges, snapshots and per-session rollups), study roles, consent, scheduling and messaging, team-owned API tokens, asset metadata, templates, webhooks, experiments, feedback, monitoring rollups, and the audit log's staged exports and alert outbox — 32 new tables, every one team-scoped under forced row-level security with the closed-study, finalized-session and participant-erasure rules enforced by database triggers. A fresh Studio instance now seeds itself with synthetic demo data across that model instead of an empty database: a handful of teams with members across every role, studies in every lifecycle state with realistic interview networks, and a fixed admin account (`admin@studio.test` / `studio-admin-not-for-production`) that owns every seeded team and holds a Manager grant on every seeded study. Email/password is now a full third sign-in method alongside magic-link and social — the sign-in screen offers a password form (toggling with magic-link when both are available), and the server accepts it through the real `/api/auth/sign-in/email` endpoint. `pnpm dev` resets and reseeds the database on every boot; the deploy-time `seed` command does the same against any target, refusing a non-local database unless `--force` makes that explicit, matching `db:reset` — and both refuse to give a non-local database the published admin password, taking `STUDIO_SEED_ADMIN_PASSWORD` instead.
- Ship the self-host deployment bundle with private PostgreSQL and object storage, HTTPS, explicit configuration and read-only diagnostics. Add quiesced recovery with independent encryption-key custody and qualify the built image against populated recovery and aggregate performance workloads.
- Add first-run setup for self-hosted Studio instances. An operator's single-use setup token creates the initial owner account and team, and completing setup remains permanent across restarts and account deletion. Further self-hosted account creation requires an invitation and a verified email through magic-link or OAuth sign-in.
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

- Ship versioned database migrations inside the Studio image. Operators apply them explicitly with the `migrate` command before starting an upgraded deployment; startup still refuses an unmigrated database. Migration checksums, transactional application, and rejection of unknown pre-release databases protect existing data during upgrades.

  Allow an administrator to provision Studio's runtime roles before a database owner without role-creation privileges applies the schema, and refuse runtime roles whose attributes or parent memberships would bypass Studio's isolation. Each migration run verifies precommitted deployment login enrollment and refuses leftover outside database connections, handles simultaneous cluster-role creation, and keeps schema fingerprints read-only to runtime roles without rewriting historical migrations.

  Check all runtime and backup role/session identities against the shared PostgreSQL 18 catalog privilege boundary before trusting migration evidence and after sidecars. Require administrators to revoke ordinary database TEMPORARY permission before admission, refuse reserved namespace capabilities and additional catalog function, table, or column grants, and prevent disconnected prepared runtime transactions from crossing a pending migration boundary.

  Before production request admission, verify the actual Studio app and maintenance sessions use distinct dedicated restricted logins with exactly one reviewed SET-only runtime membership each. Configure the application login through `DATABASE_URL` and the maintenance login through `STUDIO_MAINTENANCE_DATABASE_URL`; explicit local development alone retains a single-URL fallback. Refuse owner-backed or otherwise privileged credentials even when startup role pinning initially selects a runtime role, since `SET ROLE NONE` restores the connecting login. Refuse runtime logins granted to outside roles, and verify migration history and fingerprint relation shape before migration or server startup so inheritance, partitions, and cascading foreign keys cannot forge trusted evidence through another table's privileges.

  Require the same explicit database login enrollment at production startup and readiness as during migration. Refuse outside effective CONNECT grants and surviving outside sessions, keep both runtime connections restricted, and verify effective migration-evidence table and column privileges before reading a fingerprint. Apply the existing migration policy for owner-backed triggers and rewrite rules at startup too. Explicit local development keeps its unversioned schema path.

  Preserve separately provisioned non-owner migration and conversion operators through the explicit optional administrative login inventory. Validate it against database enrollment, refuse administrative serving identities, and require non-owner CLI migration operators to be declared before applying SQL.

  Recheck every enrolled restricted database identity during startup and readiness using the migration capability policy, including direct grants on other logins and owner-backed view access.

### Patch Changes

- Add a bounded operator module that prepares four exact nonrunning Fly Machines without activating or routing them.
- Define a pinned managed-hosting candidate with isolated KMS identities and a resource-bound monthly budget estimate. Deployment still requires separate live qualification.
- Share the PostgreSQL pool factory across Studio services, preserving URL connection settings, verified startup roles, bounded connection waits and pool capacities, and redacted idle-error diagnostics.
- Use one bounded SMTP sender for sign-in and invitation email. SMTP URLs accept connection credentials and an authority, with TLS required outside local development; URL options cannot enable message logging or override timeouts. Invitation delivery records an uncertain outcome when SMTP acceptance cannot be confirmed, preventing an automatic duplicate send.

  Validate the configured sender before startup and preserve accepted team names when composing email headers. Shutdown cancels active sends and waits for their durable outcomes before closing database connections.

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

- Add managed single-origin routing for Studio HTTP and WebSocket services, with isolated static requests and uncached authenticated responses.
- Fix the Netlify deployment answering every request with the client's "server could not be reached" screen. The lane is documented to run with no database and auth off, because a deploy preview's per-PR origin can never match PUBLIC_URL — but that rested on the Netlify site not defining DATABASE_URL, which nothing enforced. With a database configured but unusable from the function, better-auth failed the session lookup with a 500 and the CSRF gate refused the preview's own requests. The Netlify entrypoint now drops both surfaces itself, so the documented degradation is what runs: sign-in reports that it is unavailable on this server instead of the app replacing itself with an error screen.
- Keep application and background database connections on their intended roles when database URLs include startup options. Preserve connection settings and refuse a client whose actual role does not match before any application query runs.
- Take the protocol-authoring contract from `@codaco/protocol-builder-core`
  rather than `@codaco/protocol-builder`. The contract, its schemas and its typed
  errors are unchanged — they now live in a package with no React and no
  `@codaco/fresco-ui` in its dependency closure, so a change to the stage
  editors' UI no longer invalidates the server's build and test selection.
- Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. A section lock belongs to the browser tab that took it rather than to the socket that carried the call: the client mints an id once per page load and sends it as a header on every `/rpc` call, and the server reads the same id off a `/ws` upgrade URL, because a browser cannot put a header on a handshake. It is never persisted, because a browser copies `sessionStorage` into a duplicated tab and two documents naming one owner would both be granted the same section. So two tabs of one researcher are two owners and the second opens read-only behind the first, but a tab whose socket drops is the same tab when it reconnects and still holds the section it has open. A tab that never comes back gives its sections up, with the lock events that say so, once the reconnect grace is out. A write that has to change a section it holds no lock on is refused naming who holds it: a create while an editor has the stage index open, and a write promoting resources while one has the asset manifest open, since that editor's next whole-section submit would take the new pointer or the new manifest entry straight back out. A create takes a promotion of its own, for the reason a submit cannot cover — a stage being added can carry a file imported while it was composed, and there is no earlier revision of it to promote with — so the section, its pointer and the manifest entries land in one revision or not at all. A retried write is answered with what its first attempt committed rather than writing again, which for a create means the stage it already made rather than a second copy: every submit and every create carries an idempotency key of its own, and the receipt for it is written in the same transaction as the revision it describes, so the answer survives a restart — the client whose answer went missing is exactly the client reconnecting to a server that came back up. Staged resources belong to the edit that imported them rather than to the connection, because one researcher can have a codebook dialog open over a stage editor: neither one's cancel takes away the file the other is about to submit, and neither one's submit promotes what the other imported. Promoted bytes are committed under their content hash, so two imports of different files sharing a filename stay two assets, while the manifest still records the name the researcher gave them. Deleting a stage other stages depend on is refused naming where they name it, rather than silently rewriting a collaborator's skip logic as a side effect. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read — including the stage dependants a deletion is refused for, derived from the protocol schema's own stage-reference tags — and exports the per-section shape check they had each written for themselves.
- Centralize background delivery retries, lease renewal, and operational measurements while preserving invitation delivery safeguards.
- Define a portable template exchange format with versioned research metadata,
  content and license hashes, bounded archive validation, and shared Studio
  protocol checks. Registry publication and import can verify the same immutable
  template identity across managed and self-hosted instances.
- Authenticate managed ingress requests before trusting their forwarded client address.

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`; production supplies distinct restricted application and maintenance logins that may assume only their intended role. The server's application pool cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
