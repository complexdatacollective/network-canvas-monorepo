---
"@codaco/protocol-validation": patch
"@codaco/interview": patch
---

Harden protocol import/validation and make interview autosave failures recoverable:

- **Zip-bomb protection:** `extractProtocol` now caps the _actual_ inflated output incrementally as it decompresses, instead of trusting the archive's declared uncompressed size. A crafted `.netcanvas` (deflate bomb) can no longer exhaust memory; the new `NetcanvasInflationLimitError` is thrown when the limit is exceeded.
- **Locked value sets** (biological sex / gamete role / relationship type) are now enforced for read-only **ordinal** variables, not only categorical ones, so their canonical options can't be silently altered.
- Form-field and composer-field schemas tolerate a persisted stable `id`, so editors can keep durable field identity across reorder and delete.
- **Autosave durability:** the interview sync middleware no longer advances its "last synced" marker before the write resolves. A failed autosave (e.g. a locked vault or storage quota) is now retried on the next debounce instead of silently dropping just-added network data.
