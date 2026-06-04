---
'@codaco/interview': patch
---

`FamilyPedigree`: the wizards that pick a parent now offer a topology-aware
candidate list. Genetic (egg/sperm) parents are restricted to people who could
plausibly be a genetic parent of the new node — the relevant co-parents plus any
existing donor (reusable) — so adding a sibling no longer offers the
participant, their children, or their grandparents. Social/adoptive parents
(via "Add parent") can now be an existing person, such as an aunt/uncle or
grandparent who became a child's adoptive parent, instead of only a newly
created one. Defining a node's parents offers the same genetic candidate list.
