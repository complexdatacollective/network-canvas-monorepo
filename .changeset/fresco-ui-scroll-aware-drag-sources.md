---
'@codaco/fresco-ui': minor
---

Drag sources now share touch gestures with the scroll regions around them. `useDragSource` sets `touch-action` from the axes the enclosing `ScrollArea`s can currently scroll, instead of always `pan-y`: movement within 30° of a scrollable axis scrolls, steeper movement drags, and a region with nothing to scroll leaves every direction to the drag. Outside any `ScrollArea` the page is assumed to scroll vertically, as before. Holding a touch still for 300ms lets a drag move along the scroll axis too; the source carries `data-drag-armed` while it is held.

- `ScrollArea` exports `useScrollAxes()` and the `ScrollAxes` type: the axes the enclosing regions can scroll, combined across nested regions.
- A `ScrollArea` whose only overflow is on an axis it clips (a horizontal region's vertical overflow) is no longer a tab stop.
- A `pointercancel` during a drag now cancels the drag instead of dropping it where the pointer was.
- A drag ignores pointers other than the one that started it.
