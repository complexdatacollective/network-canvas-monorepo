---
'@codaco/fresco-ui': patch
---

SegmentedToolbar tooltips now share one tooltip group: once a tooltip is open, moving to an adjacent control shows its tooltip immediately instead of restarting the hover delay. Tooltips also hide instantly on close (no exit animation), so rapid movement across grouped controls never shows more than one tooltip at a time.
