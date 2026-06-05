---
'@codaco/interview': patch
---

`FamilyPedigree`: a node's partner is no longer offered as a possible parent of
that node. The "add parent" social/adoptive list now excludes the node's
partners (a partner can't be a parent), and the genetic "define parents" list
excludes them too so a partner who has also been recorded as a donor can't be
offered as the node's own genetic parent.
