---
'@codaco/interview': patch
---

Keep canvas nodes fully visible at the canvas edge on every screen size. The
boundary that stops a dragged or auto-laid-out node at the edge of the
Sociogram, Narrative, and Network Composer canvases now uses the node's real
rendered size instead of a fixed estimate, so larger nodes on wide displays are
no longer partially cut off when moved to the edge of the canvas.
