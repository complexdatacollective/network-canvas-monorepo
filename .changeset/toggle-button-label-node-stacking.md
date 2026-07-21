---
'@codaco/fresco-ui': patch
---

Toggle button labels no longer paint over content stacked above them. Their text sat in the same stacking context as the surrounding page rather than being scoped to its own button, so a form's pinned header could be overlapped while scrolling.
