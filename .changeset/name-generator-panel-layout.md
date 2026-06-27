---
'@codaco/interview': patch
---

Fix two layout bugs in name-generator side panels:

- When two panels are open they now share the rail evenly (~50/50) instead of
  the panel with more content taking almost all the space and leaving its
  sibling a sliver.
- A collapsed panel now keeps its full title bar visible instead of shrinking to
  nothing and hiding the title.
