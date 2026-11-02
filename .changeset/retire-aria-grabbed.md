---
'@codaco/fresco-ui': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Draggable nodes and drop zones no longer carry the `aria-grabbed` and `aria-dropeffect` attributes. Both were removed from the ARIA standard and no current screen reader reads them, so nothing a participant hears changes: drag and drop is still announced through the live region. The drag state that styling and tests need is now exposed as `data-dragging` on a node being dragged and `data-drop-target-valid` on a drop zone that accepts the item.
