---
'@codaco/fresco-ui': patch
'fresco': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
---

Interviews start faster because icons named in a protocol are now downloaded
only when they are first shown, instead of every icon being downloaded up
front. An icon keeps its space on screen while it loads, so nothing moves when
it appears.
