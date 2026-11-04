---
'@codaco/fresco-ui': patch
'fresco': patch
---

Fresco's dashboard, sign-in and setup pages load faster. Form labels, hints and options written as plain text no longer download the markdown renderer; it now loads only when a label actually uses formatting.
