---
'fresco': patch
---

An interview no longer loses its most recent answers when two saves are in flight at once. When a tab is hidden or closed, the browser sends the outstanding answers straight away rather than waiting behind a save already on its way to the server — so the two can overlap, and the server could finish them in either order. If the older one finished last it overwrote the newer answers with the state from a few seconds earlier. Each save now carries its position in the browser's own sequence, and the server keeps a save only when it is newer than the one the interview already holds; one that lost its race is discarded instead of rolling the participant's answers back.
