---
'@codaco/fresco-ui': minor
---

A form can be handed the document it edits, and be closed to editing.
`<Form initialValues={…}>` (and `<FormStoreProvider>`) seeds any field that
names no starting value of its own from the document at the field's own name,
nested names included — read when each field mounts, so a control revealed
later opens on the document as it stands then rather than as it stood when the
form opened. A field mounting at a container path starts on the document's
reading of that path with only the paths other fields are actually mounted at
written over it, so it shows the edits made inside it without dropping the keys
beside them that nothing renders. The document is the only thing that seeds a
field: a form handed none starts every field holding nothing, as before.
`FieldsDisabled` marks every field beneath it unavailable, so a record somebody
else is holding is said once by the form rather than remembered by each
control; a field that disables itself still does.
