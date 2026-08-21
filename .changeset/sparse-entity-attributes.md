---
'@codaco/shared-consts': major
---

Entity attributes now have one serialization-safe contract: every stored value is defined, and a missing key means the answer is unset. Legacy networks containing `null` or `undefined` attributes remain readable and are normalized without losing valid empty values such as `false`, `0`, empty text, or empty selections.

This is a breaking type and data-shape change: `VariableValue` no longer includes `null`, and parsed `NcNetwork` values omit nullish attributes. Consumers should treat attribute absence as the unset state.
