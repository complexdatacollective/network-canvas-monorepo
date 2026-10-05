---
'fresco': patch
---

The dashboard navigation bar no longer disagrees with the page the server
sent.

The bar decided its starting position from the researcher's "reduce motion"
setting, which the server cannot know when it writes the page. A researcher
with that setting enabled was therefore sent one starting position and then
produced another, a disagreement React reports as one it will not reconcile.

Fresco already applied the preference for every animation in the dashboard, so
the bar had no need to consult it a second time. Reduced motion still means the
bar appears without sliding into view.
