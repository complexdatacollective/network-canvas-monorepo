---
'@codaco/fresco-ui': minor
---

ArrayField's `itemTemplate` callback now receives the current confirmed item
count, so templates can vary a new item's defaults by its position. Existing
zero-argument templates keep working unchanged.
