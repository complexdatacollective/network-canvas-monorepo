---
'@codaco/studio-sync': minor
'@codaco/studio-server': patch
---

Share the PostgreSQL migration runner and checksummed artifact loader across applications, with explicit roles, database enrollment, schema evidence, and migration history configuration. Studio retains its existing migration history and security checks.

Refuse runtime access through owner-backed relations or large objects and backup access that could change application data, sequences, or large objects. Check existing migration evidence permissions before trusting its history or fingerprint, and contain each migration's historical grants before continuing. Preserve existing read-only backup access.

Require a dedicated migration history schema so its access restrictions cannot remove runtime access to application tables.

Reject migration history and fingerprint relations that are partitions, use ordinary inheritance in either direction, or have unsupported relation kinds before reading their evidence.

Refuse disconnected prepared runtime transactions before pending migration SQL and immediately before its commit while preserving no-op verification.

Refuse SECURITY DEFINER triggers and identities able to bypass large-object permissions. Require versioned migration provenance at Studio startup and readiness while preserving explicitly enabled development databases.

Require explicitly configured runtime login membership sets and administrator removal of large-object creation capabilities. Refuse owner-backed rewrite rules, unsafe persisted session settings, and ordinary relation privileges that bypass application access controls.

Use the shared database enrollment and migration evidence guards for every configured migration runner. Preserve each application's role sets and schema identifiers while refusing outside CONNECT and effective evidence-write privileges before recorded history is trusted.

Use the same complete restricted-identity capability policy as runtime admission, preserving independent role classes and rejecting direct enrolled-login data grants and owner-backed view access. Validate disjoint classes before a migration connection can be supplied.

Keep closed enrolled identities subject to the complete capability checks during explicitly requested backup verification, without reopening quarantined logins or weakening runtime and migration admission. Bind backup-specific checks to the verifier’s same bounded connection.
