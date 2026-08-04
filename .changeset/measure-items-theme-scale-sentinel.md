---
"@codaco/fresco-ui": patch
---

Virtualized collection measurements now invalidate when a themed region's
type scale changes while mounted — for example the interview's participant
text-size control. The re-measure sentinel is sized in the theme's
`--theme-root-size` unit instead of `rem`, which only tracked the document
root and missed locally scoped scale changes, leaving stale row geometry.
