---
'@codaco/studio-api': minor
---

Studio now works only with protocols at the current schema version, and never changes a stored protocol or interview to a newer one. The migrate job no longer upgrades the protocol versions that studies are pinned to, a draft made from a published version is a plain copy of it, and starting an interview no longer checks the pinned version's schema. The database migration `0006_drop_migrated_from_version` removes the `migrated_from_version_id` column from `protocol_versions`, which recorded the version an upgraded draft came from.
