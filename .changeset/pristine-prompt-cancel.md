---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

Opening a Sociogram prompt whose node interaction is set to attribute toggling and pressing Cancel without changing anything no longer asks whether to discard your changes.

In `@codaco/fresco-ui`, a value staged through `setFieldValue` for a path no mounted field holds is now measured against the form's document at that path, so `selectIsFormDirty` no longer reports a form dirty when a host restates a value the document already has.
