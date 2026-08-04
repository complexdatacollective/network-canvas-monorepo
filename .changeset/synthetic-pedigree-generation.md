---
'@codaco/protocol-utilities': minor
'@codaco/shared-consts': minor
'@codaco/architect': patch
---

Generate realistic family pedigrees, and make synthetic generation respect the order an interview runs in.

A pedigree is now built by its own module, from population fertility distributions rather than by joining random nodes into a tree. Generated families have partnerships, two parents per child, one proband, and a condition that descends by its declared inheritance pattern; adoption, donated gametes and gestational carriers are modelled, and the stage's own completeness boundaries decide how much of the family is drawn. A new `validatePedigreeStructure` in `@codaco/shared-consts` holds the invariants the interview runtime enforces, so the generator and the runtime cannot drift.

Every other stage now writes only the variables it collects. A name generator that never asks about a pedigree's proband flag no longer produces people carrying it.
