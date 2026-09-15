---
'@codaco/fresco-ui': patch
---

Popover, tooltip and dropdown arrows now join their surface cleanly. The
arrow's outline was landing half a pixel off the surface border, which left a
small notch on either side of it and a lip of border hanging past the surface's
edge. The arrow also sat two pixels to one side of whatever opened it, and on
surfaces anchored left or right it could drift far enough along the edge to
overlap the rounded corner rather than the straight run beside it.
