---
'@codaco/tailwind-config': patch
'@codaco/interview': patch
---

Keep a category's name visible when the people in it have long names. In the
Categorise People screen, each category circle summarises who it holds by naming
the first person in it. A long enough name grew that summary past the circle and
pushed the category's own name off the top edge, leaving a circle of text with
nothing saying which category it was.

The summary now shortens with an ellipsis instead of growing, the count of
everyone else in the category stays on its own line so it survives the
shortening, and both the category name and the summary sit inside the circle
rather than running under its edge. Tapping the category still opens it to show
everyone in full.
