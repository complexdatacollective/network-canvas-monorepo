---
'@codaco/fresco-ui': minor
---

`Collection` accepts a `footer`, rendered after the items inside the scrolling viewport so it scrolls with them. Use it for content that belongs to the list but is not one of its entries, such as a closing note or a prompt. It is not a collection item: it takes no roving-focus props and is skipped by arrow-key navigation and type-ahead, so give it a role other than `option` and its own focusable controls.
