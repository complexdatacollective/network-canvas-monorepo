---
'@codaco/architect': patch
---

Choosing an attribute from a picker now takes a single click. Opening the
picker used to count as leaving the field it belongs to, so the editor behind
it filled with validation errors about the entry being made, and the redraw
that followed could swallow the click that was about to answer them.
