---
'@codaco/interview': patch
---

`FamilyPedigree`: a parent who is both the egg source and the gestational
carrier of a child now gets a single parent→child edge (flagged as carrier)
rather than a duplicate one. This fixes existing children appearing twice when
adding a partner, and a latent issue where the extra edge could skew the
egg/sperm preselection when adding a sibling. A store-level guard now throws if
a second edge of the same relationship type is created between the same pair of
nodes, so duplicate-edge bugs surface immediately instead of accumulating
silently.
