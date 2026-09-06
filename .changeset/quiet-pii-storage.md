---
'@codaco/studio-server': minor
---

Encrypt participant contact fields and OAuth/webhook credentials with versioned keys, require immutable audits for protected reads, and verify durable key evidence before server startup. Add bounded operator commands for key verification, resumable rotation, and legacy credential conversion, with real PostgreSQL backup/restore coverage.

Protect retained upgrade plaintext with column-level runtime grants, audit credential deletions atomically across unlink and user cascades, and keep resumed maintenance pages bounded without repeated corpus scans.
