---
'@codaco/fresco-ui': minor
---

Likert and visual analog scales respond to being tapped again. Pressing anywhere
along the scale had stopped moving the marker at all, so a participant could
only answer by dragging it — and on a scale they had not answered yet, pressing
the marker without moving it recorded nothing. Both now register the position
that was pressed, and pressing an unanswered scale without moving it records the
value the marker is resting on.

The marker's press animation moved to a nested element to make this work, so
`sliderThumbVariants` no longer carries the marker's fill. The new
`sliderThumbSurfaceVariants` supplies it, and both scales pair the two.

The same restructure clears the render loop that had held Base UI at 1.6, so the
workspace now tracks 1.7.
