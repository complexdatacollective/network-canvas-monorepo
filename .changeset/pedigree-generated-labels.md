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
are unnamed again, and their labels follow the family as it changes. The stage
records which labels it generated in its stage metadata, which now accepts a
`generatedLabels` record and no longer requires a `framing`.
