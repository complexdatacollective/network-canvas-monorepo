---
'@codaco/fresco-ui': minor
---

Nodes whose names are too long to fit now reveal the full name in a tooltip on mouse hover or keyboard focus — and only when the name is actually cut off. Tapping, selecting, and dragging behave exactly as before, and the tooltip never captures pointer input. Adds the `useIsTruncated` hook (`@codaco/fresco-ui/hooks/useIsTruncated`) for detecting real visual truncation, a `pointerEvents` prop on `TooltipContent` for purely decorative tooltips, and a `tooltipDisabled` prop on `Node` for hosts that need to opt out.
