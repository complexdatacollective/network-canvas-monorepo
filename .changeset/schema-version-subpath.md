---
'@codaco/protocol-validation': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

`@codaco/protocol-validation` adds a `./schema-version` subpath that exports `CURRENT_SCHEMA_VERSION` without loading any protocol schemas. `@codaco/interview/protocol-schema-version` now reads the version from it, so a page that only needs the schema version no longer downloads the whole validation library. In Fresco, this removes about 200 KB of compressed JavaScript from the landing, onboarding, sign-in, and dashboard pages.
