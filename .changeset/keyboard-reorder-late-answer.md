---
'@codaco/fresco-ui': minor
---

`useKeyboardReorder` handles moves whose result arrives later, and no longer takes focus back from someone who has moved on.

- `onMove` can return a promise of whether the move landed, for a list that asks a server. If the promise resolves `false` or rejects, the control stops waiting to take focus back, as it already did for a move refused straight away. Before, a move that failed at the server left the control waiting, so a later unrelated reorder could pull focus onto it.
- After a move, the control takes focus back only if the reorder took it away (focus is on the page body or still on the control). Someone who moved focus elsewhere while the move was landing keeps it.
- `focusWasLost` is exported for a list that gives focus back to a control of its own after the same kind of move.
