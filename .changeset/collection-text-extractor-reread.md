---
'@codaco/fresco-ui': patch
---

A collection now reads each item's type-ahead text again when its `textValueExtractor` changes, not only when its `items` do, so text that changes while the items stay the same (a label that is decrypted or translated) is what type-ahead finds. Pass a stable `textValueExtractor`, such as a function defined outside the component: a new function on every render rebuilds the collection on every render.
