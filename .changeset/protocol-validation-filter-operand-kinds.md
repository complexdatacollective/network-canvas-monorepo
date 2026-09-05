---
'@codaco/protocol-validation': minor
---

State what kind of value each filter operator compares against once, and
export it. `FilterOperandKinds` maps every operator to `none`, `number`,
`integer`, `string` or `attribute`, and schema 8's filter-rule validation now
reads that table instead of keeping three private operator lists of its own.
`filterValueSchema` is exported alongside it, so a protocol builder can choose
each operand's input control from the same statements the validator applies
rather than from a second list that could drift.

Two rule-value verdicts change with it. A comparison value may now be a
fraction: `filterValueSchema` previously required whole numbers, which left a
scalar attribute — recorded as a normalised 0-1 reading — with no expressible
comparison beyond the two ends of its scale, and rejected an ordinary
`hours > 2.5` rule against a number attribute. The four operators that count
SELECTED OPTIONS still require a whole number, and now say so: a fractional
count is reported as an issue rather than stored as a rule that can never be
satisfied.

Nothing here asks whether a rule's operand is one of the options its attribute
authored. That check stays out of this validator on purpose: protocols already
in the field hold rules naming an option a collaborator has since renamed or
deleted, and refusing to LOAD one would lock the researcher out of the very
editor that could fix it. Whether an operand is still one of the attribute's
options is an editor rule, reported on the rule by the protocol builder.
