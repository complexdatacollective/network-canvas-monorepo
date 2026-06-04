---
'@codaco/interview': patch
---

`FamilyPedigree`: confirm each child's egg and sperm parent. The quick-start
previously asked only how many children the participant had with a partner and
then assumed both were the child's biological parents, which made the "Add
parent" dialog offer impossible genetic options on those children. The
quick-start now captures each child's egg parent, sperm parent, and gestational
carrier with the same `BioTriad` model used by the "Add child" wizard
(generating donor/surrogate parents as needed), and the "Add parent" dialog no
longer offers a biological or donor parent type once a child already has two
genetic parents.
