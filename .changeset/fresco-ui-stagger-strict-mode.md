---
'@codaco/fresco-ui': patch
---

A collection's items now play their fade-in under React's StrictMode. Before,
StrictMode's second mount skipped it, and with Motion 14 that left the items
at opacity 0, so a list in a development build looked empty.
