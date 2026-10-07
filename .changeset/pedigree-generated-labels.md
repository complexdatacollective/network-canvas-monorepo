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
("Sister (partner of Tom)") or else numbered, and never repeats a typed name. On
a return visit those people are unnamed again and are given fresh labels when
the participant leaves. The stage records which labels it generated in its stage
metadata, which now accepts a `generatedLabels` record and no longer requires a
`framing`.
