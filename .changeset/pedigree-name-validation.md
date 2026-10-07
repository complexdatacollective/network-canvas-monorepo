---
'@codaco/interview': patch
'@codaco/protocol-builder': patch
'@codaco/protocol-utilities': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The family pedigree's name question now applies the validation set on the name
attribute in the codebook to the names participants type: a unique name can't
repeat another person's typed name, and length rules apply. A name can still be
left blank, and the question is always labelled "Name (optional)".
