---
'@codaco/fresco-ui': minor
---

A form can be handed the document it edits, and be closed to editing.
`<Form initialValues={…}>` (and `<FormStoreProvider>`) seeds any field that
names no starting value of its own from the document at the field's own name,
nested names included — read when each field mounts, so a control revealed
later opens on the document as it stands then rather than as it stood when the
form opened. `FieldsDisabled` marks every field beneath it unavailable, so a
record somebody else is holding is said once by the form rather than remembered
by each control; a field that disables itself still does.
