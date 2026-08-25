---
'@codaco/shared-consts': major
---

Shared error formatting now turns unexpected failures into concise user-facing messages without exposing stack traces. Applications and protocol tooling use this common implementation for validation, imports, roster loading, and synchronization errors.

The pedigree value sets have moved out of this package, because they define what a protocol schema version accepts and must not be able to change without that version changing. `RELATIONSHIP_TYPES`, `RELATIONSHIP_TYPE_OPTIONS`, `GAMETE_ROLES`, `GAMETE_ROLE_OPTIONS`, `BIOLOGICAL_SEX_VALUES`, `BIOLOGICAL_SEX_OPTIONS`, `FRAMING_IDS`, `INHERITANCE_PATTERNS`, and their types are now exported from `@codaco/protocol-validation`. The wording that travelled with them — `FRAMING_TERMS`, `FRAMING_AUTHOR_LABELS`, and the biological-sex question, hint, and lead-in — is interview and editor copy, and now lives with the screens that display it.
