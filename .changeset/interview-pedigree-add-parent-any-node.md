---
'@codaco/interview': patch
---

`FamilyPedigree`: "Add parent" is now available on every node, including ego's
partner. Previously it was hidden only for ego's direct partner, while every
other married-in partner (e.g. a child's partner) could add parents — an
inconsistency. A married-in person's parents are collected when clinically
relevant (recessive/X-linked risk, consanguinity, an affected partner), and the
consultand's own partner is among the most likely to warrant it, so the action
is offered everywhere and left to the user's judgement.
