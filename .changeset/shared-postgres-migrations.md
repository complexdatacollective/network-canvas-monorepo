---
'@codaco/studio-sync': minor
'@codaco/studio-server': patch
---

Share the PostgreSQL migration runner and checksummed artifact loader across applications, with explicit roles, database enrollment, schema evidence, and migration history configuration. Studio retains its existing migration history and security checks.

Refuse runtime access through owner-backed relations and backup access that could change application data or sequences. Keep migration evidence protected from backup writes while preserving existing backup reads.
