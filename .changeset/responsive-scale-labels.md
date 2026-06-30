---
'@codaco/fresco-ui': minor
---

Make `VisualAnalogScale` and `LikertScale` labels responsive so they stay
readable and on-screen when space is tight. Likert labels now follow a measured
three-tier ladder — wrap (never clipping), then clockwise-rotated labels centred
on each tick, then end anchors only — escalating as far as the available width
and vertical budget require. Both fields gain a transient value popover that
rides the thumb during adjustment (the current option label for Likert, the
value for VAS). Adds an optional `maxLabelHeight` prop to `LikertScale` to
override the viewport-derived vertical budget.
