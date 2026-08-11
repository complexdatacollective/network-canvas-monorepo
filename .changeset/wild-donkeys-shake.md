---
'@codaco/fresco-ui': minor
'@codaco/interview': patch
---

Names that are too long for a node now shrink to fit instead of being cut off, so most are readable in full at a glance. A name that is still too long at the smallest readable size can be read in full by pressing and holding it, or by moving to it with the keyboard. Holding never moves or selects the person, and letting go leaves everything exactly as it was.

For developers, the Node component is now the single gesture recognizer for its own pointer sequence: hosts declare `onClick`, `onLongPress`, and `onDragStart`/`onDragMove`/`onDragEnd`, and the node classifies each gesture as exactly one of them and renders every visual and accessibility consequence itself — press animation, hold indicator, grab/grabbing cursor, pointer capture, `aria-grabbed`, `aria-pressed` from `selected`, and a tab stop whenever focusing does something. Canvas hosts implement drag effects through `useCanvasDrag`'s callback API instead of attaching their own pointer listeners.
