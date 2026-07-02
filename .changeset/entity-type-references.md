---
'@codaco/protocol-validation': minor
---

Add `collectEntityTypeReferences`: every codebook node/edge type referenced by
a protocol, discovered from schema-level `entityTypeReference` tags — the
entity-type counterpart of `collectEntityAttributeReferences`. Covers stage
subjects (including the Network Composer's per-edge-type entries), edge
creation/display prompt settings, the Family Pedigree node/edge configs, and
filter rules. Architect's codebook usage detection now derives node/edge type
usage from this instead of hand-maintained path lists, so new stage types are
covered automatically — and types referenced only by filters now correctly
count as in use.
