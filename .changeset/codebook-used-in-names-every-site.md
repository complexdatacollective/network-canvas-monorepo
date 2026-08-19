---
'@codaco/architect': patch
---

The Codebook's "Used In" column names where an attribute is used, whatever the
protocol calls things.

Architect worked out those entries by writing each reference's location down as
a single dotted string and then splitting it back apart to read the pieces. A
protocol may name an attribute or an entity type with a dot in it — `owner.id`
is as valid as any other name — and splitting cannot tell that dot apart from
the ones separating the pieces. The row then pointed at a name no codebook
holds, and read `Used as validation for "unknown"` or
`Used in shape settings for "unknown"` instead of naming the attribute or the
type. The column now reads the locations as the structure they already are, so
it names them correctly.

Nothing else about the column changes: the same wording, for the same
references, in the same order.
