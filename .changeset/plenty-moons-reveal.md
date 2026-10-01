---
'networkcanvas.com': patch
---

Scroll-reveal sections now render correctly for visitors who prefer reduced
motion.

The reduced-motion preference decided the starting state passed to the animation
library, but the server cannot know that preference — so every visitor was sent
markup holding the pre-animation state, and a visitor who prefers reduced motion
then rendered something different over the top of it. React reports that
disagreement as a mismatch it will not reconcile, which left those visitors able
to see the wrong styles and logged an error on an otherwise healthy page load.

The starting state is now the same for everyone, and the preference decides only
the duration. Reduced motion still means no visible transition — and now reaches
the finished state as soon as the page loads, rather than waiting to scroll into
view.
