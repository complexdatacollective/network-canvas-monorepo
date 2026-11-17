---
'@codaco/protocol-validation': patch
---

Reloading `migrateProtocol` without reloading the rest of the package no longer throws "Migration from version 1 already registered". `protocolMigrations` is now created in the module that registers the migrations into it, so a dev server's hot reload after a schema migration file changes builds a fresh chain instead of registering into the old one. The export is unchanged.
