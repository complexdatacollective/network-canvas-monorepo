---
'@codaco/shared-consts': minor
---

Shared error formatting now turns unexpected failures into concise user-facing messages without exposing stack traces. Applications and protocol tooling use this common implementation for validation, imports, roster loading, and synchronization errors.
