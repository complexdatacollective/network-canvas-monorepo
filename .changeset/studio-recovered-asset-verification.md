---
'@codaco/studio-server': minor
---

Add a quarantine-only recovery command that verifies every restored Studio asset
against the database's complete metadata inventory with a dedicated read-only
backup identity, bounded streaming SHA-256 and byte-size checks, and explicit
database, object and operation deadlines.
