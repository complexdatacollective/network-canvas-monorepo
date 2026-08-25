---
'@codaco/fresco-ui': patch
---

Checkbox and toggle button groups no longer crash when given a value that is not an array. A host that swaps the control under a still-registered field — a form whose question type changes, say — could hand the group a boolean or number for one render and take the page down with it. Such a value now renders nothing selected until the host settles, and a value of the wrong shape can no longer select entries by accident.

The scroll fade at the top of a `ScrollArea` is now confined to its own stacking context, so it can no longer paint over content that follows the scrolling region.
