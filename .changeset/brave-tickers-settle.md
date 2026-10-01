---
'networkcanvas.com': patch
---

The homepage news ticker no longer breaks the page for visitors who prefer
reduced motion.

The ticker chose between two different layouts based on that preference, but the
server cannot know it — so the page arrived built one way and was immediately
re-rendered the other way. React treats that disagreement as a failure, discards
everything it had already placed on the page and builds it again from scratch,
which is slower and loses the benefit of sending a finished page at all.

The ticker now arrives the same way for everyone and settles into its reduced
version once the page is interactive. It never animates for these visitors at
any point.
