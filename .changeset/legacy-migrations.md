---
"@codaco/protocol-validation": minor
---

Add legacy protocol migration support for schema versions 1 through 7. The package can now migrate protocols from any schema version (1-8) to the current version 8. This includes the v3→v4 name sanitization migration and the v5→v6 NameGenerator type consolidation, along with no-op version bumps for intermediate versions.
