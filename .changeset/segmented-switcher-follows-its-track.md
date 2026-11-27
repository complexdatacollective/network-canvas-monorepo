---
'@codaco/fresco-ui': patch
---

The highlight in a segmented switcher and the handle of a toggle now stay
inside their track when the control moves. Before, if changing the choice also
moved the control, for example because the dialog that contains it changed
height, the highlight or handle slid in from where the track had been. Each now
slides only along its track.
