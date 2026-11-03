---
'@codaco/fresco-ui': patch
---

An empty list (an empty drop zone, a roster with no one left, search suggestions with no match) now reads its empty message as the list's description, so screen readers hear the list's name, that it is a list, and then the message. The message still shows in the same place. Before, the message sat inside the list as if it were one of its items, which a list may not hold.
