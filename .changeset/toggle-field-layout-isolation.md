---
'@codaco/fresco-ui': patch
---

Toggles no longer replay their animation when something near them moves. Motion
groups every animating element inside a dialog together and re-measures the
whole group whenever any one of them changes, so switching one toggle on made
every other toggle on screen slide its handle as the content around it reflowed.
Each toggle's handle is now measured on its own, and only the toggle that was
actually operated animates.
