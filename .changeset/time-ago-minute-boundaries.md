---
'@codaco/fresco-ui': patch
---

Relative times such as "just now" and "5 minutes ago" now change at the moment they stop being true. They could stay out of date for up to a minute, because the clock ticked once a minute from when the time was first shown.

A collection whose list appears after the component first renders now measures its width, so arrow keys move through a grid by row and column as they do in any other collection.
