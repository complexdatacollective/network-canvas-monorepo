---
'fresco': patch
---

The dashboard navigation bar now renders correctly for researchers who prefer
reduced motion.

The reduced-motion preference decided the bar's starting state, which the server
writes into the page before it knows that preference. A researcher with reduced
motion enabled then rendered a different starting state over it, and React
reports that as a mismatch it will not reconcile — leaving the bar able to show
the wrong styles and logging an error on every dashboard load.

The starting state no longer depends on the preference; only the duration does,
so reduced motion still means the bar appears without animating.
