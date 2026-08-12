---
'@codaco/shared-consts': major
'@codaco/interview': major
'@codaco/protocol-utilities': major
'@codaco/network-exporters': major
'@codaco/interviewer': patch
'fresco': patch
---

Entity attributes now have one serialization-safe contract across interviews, synthetic data, persistence, and exports: every stored value is defined, and a missing key means the answer is unset. Legacy networks containing `null` or `undefined` attributes remain readable and are normalized to the sparse representation without losing valid empty values such as `false`, `0`, empty text, or empty selections.

This is a breaking type and data-shape change for library consumers. `VariableValue` no longer includes `null`, parsed `NcNetwork` values omit nullish attributes, and Interview session updates now remove cleared answers instead of retaining null-valued keys. Hosts that inspect `SessionPayload` or sync callbacks should treat attribute absence as the unset state.

Synthetic interview attribute setters now accept only valid `VariableValue` values. Use `unsetNodeAttribute` or `unsetEdgeAttribute` when a generated entity should keep an attribute absent; generated networks no longer fill unanswered attributes with null placeholders.

CSV and GraphML exports continue to declare codebook variables even when every response is unanswered. GraphML keys are now scoped correctly across ego, node, and edge data, including external attributes and colliding identifiers.

Interviewer and Fresco normalize older stored and synchronized sessions at their read boundaries, so existing interviews continue to hydrate, sync, and export under the new contract. Fresco also returns a controlled bad-request response for malformed sync JSON.
