# @codaco/studio-rpc

## 0.2.0

### Minor Changes

- Add the first Studio protocol editor foundation: team-scoped protocol creation and draft opening, an accessible outline/canvas/inspector shell, leased screen editing with validation and undo/redo, and shared client-safe protocol section and session contracts.
- Record team administration and current protocol mutations in a transactionally immutable, team-isolated audit log, route those Studio commands through the audited transaction boundary, and complete the invitation lifecycle with transactional email delivery and audited acceptance.
- Teams are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a team id pinned by composite foreign keys, and section documents deduplicate per team so content never crosses the boundary. The sync engine and protocol store operate only through a team-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first team-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's team membership. Deleting a team is refused until a tenant-purge path exists: no delete of a team row could remove the sync-side rows that name it.
