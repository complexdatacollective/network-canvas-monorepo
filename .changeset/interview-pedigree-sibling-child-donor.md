---
'@codaco/interview': patch
---

`FamilyPedigree`: when adding a child, the node's siblings are now offered as
possible egg/sperm parents so an existing sibling can be selected as a gamete
donor (e.g. a sister donating an egg combined with a partner's sperm) without
recreating them. Siblings are offered only in the add-child flow — a
same-generation sibling still can't be the node's own parent or a new sibling's
parent.
