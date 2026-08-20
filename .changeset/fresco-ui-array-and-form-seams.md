---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

Fresco UI now owns two answers its consumers were each working out for themselves.

**`stripManagedProperties`.** `ArrayField` adds its own bookkeeping properties to every item it hands out, and a consumer that saves an item has to take them off first. Three consumers were doing that with their own inline copy of the list, each frozen on the properties that existed when it was written — so a property added to `ArrayField` would have started arriving in saved data. The strip is now exported from `@codaco/fresco-ui/form/fields/ArrayField/ArrayField` and derived from the property definitions themselves, and adding a managed property without listing it is a compile error.

**`selectIsFormDirty`.** Exported from `@codaco/fresco-ui/form/store/formStoreProvider`, this answers whether a form currently holds values that differ from the ones its fields registered with. It is a live comparison, unlike the `isDirty` flag beside it in the same store, which is set by the first keystroke and cleared only by a reset — so anything guarding unsaved work on that flag keeps asking about a form the person has already put back by hand, and treats a form that normalised its own values at mount as edited before it was touched.

No visible change for anyone using Architect: it consumed both from its own copies and now consumes them from here.
