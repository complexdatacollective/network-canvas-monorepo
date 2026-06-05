---
'@codaco/fresco-ui': patch
---

`useField`: a field with an `initialValue` can now be cleared. The value passed
to the field component was computed as `fieldState?.value ?? initialValue`,
which re-applied the `initialValue` whenever the stored value was `undefined` —
so calling `setFieldValue(name, undefined)` (or otherwise clearing the field)
left the component still showing the initial value. The fallback to
`initialValue` now applies only before the field is registered; once registered,
the stored value (including an explicit `undefined`) is honoured.
