---
'@codaco/protocol-validation': minor
---

Stage labels are now required to be non-empty. The schema-8 stage `label` is
validated as a required, non-empty string, and the v7→v8 migration backfills any
stage with a missing, empty, or whitespace-only label with a positional default
("Stage 1", "Stage 2", …) so existing protocols upgrade cleanly.
