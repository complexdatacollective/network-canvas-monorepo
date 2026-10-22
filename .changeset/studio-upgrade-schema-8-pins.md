---
'@codaco/studio-api': minor
---

Studies pinned to a schema 8 protocol version keep running after the upgrade to schema 9. `studio-api migrate` now migrates every such version that a study which isn't closed still uses, and publishes the result as a new version of the same protocol, which records the version it was migrated from. It then moves the study's waves and its in-progress and abandoned interviews onto the new version. Each interview's answers, stage records and resume position are carried across. An interview left on the old finish screen resumes on the finish stage the migration adds, and a tab still open on the old protocol is taken over instead of saving data in the old shape. Completed interviews and closed studies are left as they are. If any version or interview can't be carried across, the upgrade rolls back, the database stays as the previous release left it, and migrate lists each version and interview it couldn't upgrade.
