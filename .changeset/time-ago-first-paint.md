---
'@codaco/fresco-ui': patch
---

TimeAgo now renders its relative timestamp in the very first frame. It
previously mounted empty and filled in a moment later (both its own state and
the SSR wrapper resolved in effects), so any re-render that recreated the
element — selecting a data-table row, for example — made the value's width
visibly collapse and re-expand.
