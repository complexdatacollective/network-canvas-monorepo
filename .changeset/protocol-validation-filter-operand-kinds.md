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

Three rule-value verdicts change with it. A comparison value may now be a
fraction: `filterValueSchema` previously required whole numbers, which left a
scalar attribute — recorded as a normalised 0-1 reading — with no expressible
comparison beyond the two ends of its scale, and rejected an ordinary
`hours > 2.5` rule against a number attribute. The four operators that count
SELECTED OPTIONS still require a whole number, and now say so: a fractional
count is reported as an issue rather than stored as a rule that can never be
satisfied.

That latitude belongs to attributes ANSWERED with a number, so the third
verdict holds it there. A rule comparing a categorical or ordinal attribute is
compared against one of the options that attribute authored, and an operand
that is not one of them — a fraction beside an ordinal, an option a
collaborator has since renamed or deleted, or `"1"` where the option's value is
the number `1` — is now reported as an issue rather than saved as a rule no
answer can ever match. Every option a list operand names is checked, and an
attribute that authors no options at all is left to the codebook's own check.
