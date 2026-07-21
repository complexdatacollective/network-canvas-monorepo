---
'@codaco/fresco-ui': patch
---

SegmentedToolbar keyboard nudges now stay within a `RefObject` drag constraint, not only an object-form one. Arrow-key moves of a draggable toolbar are clamped by measuring the constraint container against the toolbar, so a toolbar constrained to a ref can no longer be walked off-screen with the keyboard — matching the existing pointer-drag clamp.
