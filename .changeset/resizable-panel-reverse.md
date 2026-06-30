---
'@codaco/fresco-ui': minor
---

Add a `reverse` prop to `ResizableFlexPanel`. When set, the resized (first) pane
is pinned to the end of the axis (right for horizontal, bottom for vertical) and
the drag direction is inverted to match, so a size-constrained panel can sit on
the right/bottom edge while the second pane fills — and scrolls — the remaining
space. Combine with `minSizePx` to give that edge panel a hard minimum size.
