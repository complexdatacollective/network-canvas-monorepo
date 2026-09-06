---
'@codaco/studio-sync': minor
'@codaco/studio-server': patch
---

Share the PostgreSQL migration runner and checksummed artifact loader across applications, with explicit roles, database enrollment, schema evidence, and migration history configuration. Studio retains its existing migration history and security checks.

Refuse runtime access through owner-backed relations or large objects and backup access that could change application data, sequences, or large objects. Check existing migration evidence permissions before trusting its history or fingerprint, and contain each migration's historical grants before continuing. Preserve existing read-only backup access.

Require a dedicated migration history schema so its access restrictions cannot remove runtime access to application tables.

Refuse SECURITY DEFINER triggers and identities able to bypass large-object permissions. Require versioned migration provenance at Studio startup and readiness while preserving explicitly enabled development databases.
