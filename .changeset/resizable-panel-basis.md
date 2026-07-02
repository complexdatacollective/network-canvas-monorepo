---
'@codaco/fresco-ui': patch
---

Fix `ResizableFlexPanel` so the first pane honours its flex-basis even when its
content has a larger intrinsic size. Without a `0` main-axis minimum, wide (or
tall) content set `min-width/height: auto` and overrode the basis, which also
capped how far the resize handle could grow the other pane.
