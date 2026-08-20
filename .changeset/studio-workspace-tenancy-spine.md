---
'@codaco/studio-server': minor
'@codaco/studio-sync': minor
'@codaco/studio-rpc': minor
---

Workspaces are now the tenant boundary throughout Studio's data layer. Every domain row — protocols, versions, drafts, sections, manifests, leases, and the command log — carries a workspace id pinned by composite foreign keys, and section documents deduplicate per workspace so content never crosses the boundary. The sync engine and protocol store operate only through a workspace-pinned database handle (`@codaco/studio-sync/tenant`), and the RPC contract gains the first workspace-scoped procedures, `protocols.create` and `protocols.list`, authorized per request against the caller's workspace membership.
