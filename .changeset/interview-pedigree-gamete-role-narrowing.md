---
'@codaco/interview': patch
---

`FamilyPedigree`: the biological-parents step now narrows the egg and sperm
candidate lists by each node's recorded gamete role. A person already nominated
as an egg parent elsewhere in the pedigree is no longer offered as a sperm
parent, and a known sperm parent is no longer offered as an egg parent. The
gestational carrier list is unaffected.
