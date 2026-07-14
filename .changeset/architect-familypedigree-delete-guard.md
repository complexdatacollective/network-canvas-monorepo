---
'@codaco/architect': patch
---

Fix the Family Pedigree stage delete guard. It previously read a pruned stage list that never contained the reference field, so deleting a Family Pedigree stage that a Narrative Pedigree depends on silently did nothing; it now correctly shows a blocking dialog instead.
