---
'@codaco/studio-server': minor
'@codaco/studio-sync': patch
---

Ship versioned database migrations inside the Studio image. Operators apply them explicitly with the `migrate` command before starting an upgraded deployment; startup still refuses an unmigrated database. Migration checksums, transactional application, and rejection of unknown pre-release databases protect existing data during upgrades.

Allow an administrator to provision Studio's runtime roles before a database owner without role-creation privileges applies the schema, and refuse runtime roles whose attributes or parent memberships would bypass Studio's isolation. Each migration run verifies precommitted deployment login enrollment and refuses leftover outside database connections, handles simultaneous cluster-role creation, and keeps schema fingerprints read-only to runtime roles without rewriting historical migrations.

Check all runtime and backup role/session identities against the shared PostgreSQL 18 catalog privilege boundary before trusting migration evidence and after sidecars. Require administrators to revoke ordinary database TEMPORARY permission before admission, refuse reserved namespace capabilities and additional catalog function, table, or column grants, and prevent disconnected prepared runtime transactions from crossing a pending migration boundary.

Before production request admission, verify the actual Studio app and maintenance sessions use a dedicated restricted login with exactly the reviewed SET-only runtime memberships. Refuse owner-backed or otherwise privileged `DATABASE_URL` credentials even when startup role pinning initially selects a runtime role, since `SET ROLE NONE` restores the connecting login. Refuse runtime logins granted to outside roles, and verify migration history and fingerprint relation shape before migration or server startup so inheritance, partitions, and cascading foreign keys cannot forge trusted evidence through another table's privileges.

Require the same explicit database login enrollment at production startup and readiness as during migration. Refuse outside effective CONNECT grants and surviving outside sessions, keep both runtime connections restricted, and verify effective migration-evidence table and column privileges before reading a fingerprint. Apply the existing migration policy for owner-backed triggers and rewrite rules at startup too. Explicit local development keeps its unversioned schema path.

Preserve separately provisioned non-owner migration and conversion operators through the explicit optional administrative login inventory. Validate it against database enrollment, refuse administrative serving identities, and require non-owner CLI migration operators to be declared before applying SQL.
