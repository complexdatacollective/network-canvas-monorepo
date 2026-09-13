# @codaco/studio-sync

## 0.3.0

### Minor Changes

- Provide a shared PostgreSQL catalog privilege guard for migration and backup checks. Refuse capabilities beyond the stock PostgreSQL baseline, including privileged file routines, protected catalog reads and writes, grant options, reserved namespace creation or ownership, and system SECURITY DEFINER routines.
- Share the PostgreSQL pool factory across Studio services, preserving URL connection settings, verified startup roles, bounded connection waits and pool capacities, and redacted idle-error diagnostics.
- Use one bounded SMTP sender for sign-in and invitation email. SMTP URLs accept connection credentials and an authority, with TLS required outside local development; URL options cannot enable message logging or override timeouts. Invitation delivery records an uncertain outcome when SMTP acceptance cannot be confirmed, preventing an automatic duplicate send.

  Validate the configured sender before startup and preserve accepted team names when composing email headers. Shutdown cancels active sends and waits for their durable outcomes before closing database connections.

- Add Postmark as a configurable Studio email transport alongside SMTP. Sign-in
  and invitation email share single-recipient validation, bounded delivery waits,
  disabled tracking, and private diagnostic errors. Ambiguous provider outcomes
  stop automatic retries so a possibly accepted message is not sent again.
- Support complete database backups through separately held read-only credentials. A dedicated backup role can read every tenant and migration record without superuser or row-security bypass privileges. The explicit backup verification command refuses incomplete row policies, unsafe role grants, writable objects and mismatched schemas before an operator captures a backup. Exhaustive stored-key custody verification uses a dedicated five-minute bound while structural checks retain their ten-second fail-closed deadline.
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

- Define a portable template exchange format with versioned research metadata,
  content and license hashes, bounded archive validation, and shared Studio
  protocol checks. Registry publication and import can verify the same immutable
  template identity across managed and self-hosted instances.

### Patch Changes

- Serve the protocol-builder host contract over RPC and WebSocket. Studio's contract now carries `@codaco/protocol-builder`'s own contract under `protocolBuilder`, and the server implements it against the sectioned draft store: section locks over the existing lease table, whole-section writes that commit the staged resources they name in the same revision, atomic section creation with its pointer, atomic stage deletion with its pointer, compound codebook refactors that sweep every reference the protocol schema declares and refuse the ones they cannot remove, staged resources, and one ordered event channel per protocol that replays from a cursor. `/ws` serves the same router as `/rpc` in place of its echo placeholder. A section lock belongs to the browser tab that took it rather than to the socket that carried the call: the client mints an id once per page load and sends it as a header on every `/rpc` call, and the server reads the same id off a `/ws` upgrade URL, because a browser cannot put a header on a handshake. It is never persisted, because a browser copies `sessionStorage` into a duplicated tab and two documents naming one owner would both be granted the same section. So two tabs of one researcher are two owners and the second opens read-only behind the first, but a tab whose socket drops is the same tab when it reconnects and still holds the section it has open. A tab that never comes back gives its sections up, with the lock events that say so, once the reconnect grace is out. A write that has to change a section it holds no lock on is refused naming who holds it: a create while an editor has the stage index open, and a write promoting resources while one has the asset manifest open, since that editor's next whole-section submit would take the new pointer or the new manifest entry straight back out. A create takes a promotion of its own, for the reason a submit cannot cover — a stage being added can carry a file imported while it was composed, and there is no earlier revision of it to promote with — so the section, its pointer and the manifest entries land in one revision or not at all. A retried write is answered with what its first attempt committed rather than writing again, which for a create means the stage it already made rather than a second copy: every submit and every create carries an idempotency key of its own, and the receipt for it is written in the same transaction as the revision it describes, so the answer survives a restart — the client whose answer went missing is exactly the client reconnecting to a server that came back up. Staged resources belong to the edit that imported them rather than to the connection, because one researcher can have a codebook dialog open over a stage editor: neither one's cancel takes away the file the other is about to submit, and neither one's submit promotes what the other imported. Promoted bytes are committed under their content hash, so two imports of different files sharing a filename stay two assets, while the manifest still records the name the researcher gave them. Deleting a stage other stages depend on is refused naming where they name it, rather than silently rewriting a collaborator's skip logic as a side effect. `@codaco/studio-sync` gains `section-references`, the reference walk in section coordinates both hosts read — including the stage dependants a deletion is refused for, derived from the protocol schema's own stage-reference tags — and exports the per-section shape check they had each written for themselves.
- Ship versioned database migrations inside the Studio image. Operators apply them explicitly with the `migrate` command before starting an upgraded deployment; startup still refuses an unmigrated database. Migration checksums, transactional application, and rejection of unknown pre-release databases protect existing data during upgrades.

  Allow an administrator to provision Studio's runtime roles before a database owner without role-creation privileges applies the schema, and refuse runtime roles whose attributes or parent memberships would bypass Studio's isolation. Each migration run verifies precommitted deployment login enrollment and refuses leftover outside database connections, handles simultaneous cluster-role creation, and keeps schema fingerprints read-only to runtime roles without rewriting historical migrations.

  Check all runtime and backup role/session identities against the shared PostgreSQL 18 catalog privilege boundary before trusting migration evidence and after sidecars. Require administrators to revoke ordinary database TEMPORARY permission before admission, refuse reserved namespace capabilities and additional catalog function, table, or column grants, and prevent disconnected prepared runtime transactions from crossing a pending migration boundary.

  Before production request admission, verify the actual Studio app and maintenance sessions use distinct dedicated restricted logins with exactly one reviewed SET-only runtime membership each. Configure the application login through `DATABASE_URL` and the maintenance login through `STUDIO_MAINTENANCE_DATABASE_URL`; explicit local development alone retains a single-URL fallback. Refuse owner-backed or otherwise privileged credentials even when startup role pinning initially selects a runtime role, since `SET ROLE NONE` restores the connecting login. Refuse runtime logins granted to outside roles, and verify migration history and fingerprint relation shape before migration or server startup so inheritance, partitions, and cascading foreign keys cannot forge trusted evidence through another table's privileges.

  Require the same explicit database login enrollment at production startup and readiness as during migration. Refuse outside effective CONNECT grants and surviving outside sessions, keep both runtime connections restricted, and verify effective migration-evidence table and column privileges before reading a fingerprint. Apply the existing migration policy for owner-backed triggers and rewrite rules at startup too. Explicit local development keeps its unversioned schema path.

  Preserve separately provisioned non-owner migration and conversion operators through the explicit optional administrative login inventory. Validate it against database enrollment, refuse administrative serving identities, and require non-owner CLI migration operators to be declared before applying SQL.

  Recheck every enrolled restricted database identity during startup and readiness using the migration capability policy, including direct grants on other logins and owner-backed view access.

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Postgres row-level security now enforces the team boundary beneath the data layer. Every tenant table carries a `team_isolation` policy keyed on the transaction-local team id the team-pinned database handle already stamps, and row-level security is forced so no owner exemption applies: a statement that omits its team predicate sees no rows, and a write aimed at another team is refused. The schema apply creates two `NOLOGIN` roles, `studio_app` and `studio_maintenance`; production supplies distinct restricted application and maintenance logins that may assume only their intended role. The server's application pool cannot bypass policies, while garbage collection runs as `studio_maintenance`, the one role the policies admit across teams — and refuses to run as anything else.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
