---
'@codaco/interview': patch
---

`FamilyPedigree`: the node menu's "Edit name" action is now "Edit" and opens the
full person form — the name plus any protocol-supplied node form fields —
pre-populated with the node's current values, rather than just the name. Editing
is offered only while building the pedigree; once finalized, nodes are no longer
editable and the previous finalized name-only edit is removed.
