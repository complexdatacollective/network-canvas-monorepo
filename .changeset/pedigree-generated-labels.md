---
'@codaco/interview': patch
'@codaco/shared-consts': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

When a participant leaves the Family Pedigree stage, everyone they left unnamed,
including parents the interface added, is given a label as their name, so later
stages can show who is who. The label is their kinship word in the participant's
language and chosen wording, told apart by a relative where two would share it
("Sister (partner of Tom)") or else numbered, and never repeats a typed name.
The family tree shows each unnamed person by the same label throughout, so they
read the same on the canvas and in later stages. On a return visit those people
are unnamed again, and their labels follow the family as it changes, but a name
given to one of them on a later stage is kept. The stage records who holds a
generated label in its stage metadata, by a fingerprint of the stored value
rather than the label's text, so the record holds no names and works when the
name attribute is encrypted. The metadata schema now accepts this
`generatedLabels` record and no longer requires a `framing`.
