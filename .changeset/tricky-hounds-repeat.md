---
'@codaco/fresco-ui': minor
---

Form stores can now read and clear a value the form holds as a container of
nested fields, not just as one field. A form that registers `parameters.type`
and `parameters.min` never registers `parameters` itself, so reading that name
used to come back empty and clearing it did nothing.

Three new store actions cover it, each available on the store, on
`pathOperations`, and through `useFormValue`:

- `getValue(name)` returns the value at a name, assembling it out of the
  registered fields beneath it when the form holds it as a container. The
  assembled object keeps a stable identity while its contents are unchanged, so
  a component reading a container re-renders no more often than one reading a
  single field. `useFormValue` uses it, so container names now read the same way
  field names always have.
- `hasValue(name)` reports whether the form holds anything at a name — useful
  for telling a field that has not registered yet apart from one that has been
  emptied. `useFormHasValue` is the matching hook.
- `clearValue(name)` clears a name together with every field beneath it,
  including fields whose sections are currently unmounted, so a cleared value
  cannot reappear when its section comes back.
