---
'@codaco/interview': patch
---

`FamilyPedigree`: `addableParentTypeOptions` now also hides the surrogate option
once a gestational carrier is recorded for a node (it previously only removed
the genetic biological/donor options once both gamete parents were known). This
applies both when adding a parent and when adding a partner who might also be a
parent of an existing child — so a new partner of a co-parent can only be added
as a social (step/adoptive) parent of that child.
