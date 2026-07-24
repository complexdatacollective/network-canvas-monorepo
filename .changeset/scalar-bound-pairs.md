---
"@codaco/protocol-validation": minor
---

A scalar (visual analog scale) variable's `minValue` and `maxValue` validation
rules now have to be authored as a pair, with the minimum below the maximum.

These bounds double as the rendered slider's track, so a bound authored on its
own was paired with the opposite end of the default 0-1 scale and produced a
track no participant could answer — a minimum of 10 against a maximum of 1.
Validation now reports an orphaned or inverted pair against the offending
variable, and migrating a protocol to schema 8 removes any such pair, leaving
the default scale in place. Removal preserves the requiredness that a `min*`
validator used to imply.
