---
'@codaco/fresco-ui': minor
---

`useKeyboardReorder` accepts an `onMove` that answers later. A list that only learns from a server whether a move landed can return a promise of that answer. If the promise resolves `false` or rejects, the control stops waiting to take focus back, as it already did for a move refused straight away. Before, a move that failed at the server left the control waiting, so a later unrelated reorder could pull focus onto it.
