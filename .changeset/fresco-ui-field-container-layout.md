---
'@codaco/fresco-ui': patch
---

Fix form controls disappearing when content is added below them. A field's query
container and its sibling-dependent spacing shared one element, so inserting a
sibling after a field could leave its control with no layout box at all —
present but invisible and unusable.
