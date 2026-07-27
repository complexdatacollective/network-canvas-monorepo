---
"@codaco/protocol-validation": minor
"@codaco/interview": patch
---

Scalar (visual analog scale) variables no longer accept the `minValue` and
`maxValue` validation rules.

A scalar response is recorded on a normalised 0-1 scale, and these rules are
integers — so the only pair they could express on that scale was `{0, 1}`, the
scale it already has. Anything else silently redefined the variable's range
through a validation rule, which the interview then forwarded onto the slider's
rendered track without adjusting its step or value formatting. Validation now
rejects either rule on a scalar, migrating a protocol to schema 8 removes them
(preserving the requiredness a `min*` validator used to imply), and the
interview no longer derives the slider's bounds from validation.

Number variables are unaffected, and scalars keep `required` and the comparison
rules, which compare two scalars on the same scale.

Also adds a `VARIABLE_TYPE_VALIDATIONS` export: the record of which validation
rules each variable type accepts. Every variable schema now picks its
`validation` shape from this record, so an authoring UI can build its per-type
rule list from the same source rather than maintaining a parallel copy.
