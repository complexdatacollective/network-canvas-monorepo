---
'@codaco/studio-server': minor
'@codaco/studio-sync': patch
---

Ship versioned database migrations inside the Studio image. Operators apply them explicitly with the `migrate` command before starting an upgraded deployment; startup still refuses an unmigrated database. Migration checksums, transactional application, and rejection of unknown pre-release databases protect existing data during upgrades.

Allow an administrator to provision Studio's runtime roles before a database owner without role-creation privileges applies the schema, and refuse runtime roles whose attributes would bypass Studio's isolation.
