---
'@codaco/interview': patch
'@codaco/protocol-builder': patch
'@codaco/protocol-utilities': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The family pedigree's name question now applies the validation set on the name
attribute in the codebook. A required name must be given before a person can be
saved, a unique name can't repeat another person's, and the question is labelled
"Name (optional)" only when a name isn't required. A person with no name counts
as missing a detail when names are required.
