---
'@codaco/fresco-ui': patch
---

SegmentedToolbar keyboard nudges now stay within a `RefObject` drag constraint, not only an object-form one. Arrow-key moves measure the constraint container against the toolbar, and an oversized toolbar receives a pannable range instead of jumping to one edge.
