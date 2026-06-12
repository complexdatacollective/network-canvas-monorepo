---
'@codaco/fresco-ui': patch
---

Fix `RichSelectGroup` option cards not filling the container width when a `horizontal` group wraps onto multiple lines. Wrapped cards now `grow` to the full width of their line, so every option reaches the container edge regardless of how long its description is. Cards that share a line in a content-sized group are unaffected.
