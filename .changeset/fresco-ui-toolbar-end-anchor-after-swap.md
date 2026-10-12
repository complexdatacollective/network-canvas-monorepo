---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
---

A `SegmentedToolbar` that rests at its trailing end (`restAt="end"`) no longer
opens scrolled part-way along when every control fits. If its controls changed
while the toolbar was still animating into place, it could cut off the first
control, leave an empty gap after the last, and fade an edge that hid nothing.
In Architect's page actions this showed as a clipped "Return to Start Screen"
button. The toolbar now measures where its controls sit rather than the space
their animation briefly took up, so it rests at its start with no fade, and
still rests at its end when the controls genuinely do not fit.
