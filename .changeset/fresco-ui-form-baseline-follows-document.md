---
'@codaco/fresco-ui': patch
---

A form's baseline follows the document it is handed. `<Form initialValues={…}>`
(and `<FormStoreProvider>`) gave a field its starting value when the field
mounted and never moved it again, so a document that advanced while the form
was open — a host taking the save and handing back what it stored — left every
field on screen measured against the reading it opened on. The form went on
reporting itself dirty over work that was saved, and a host guarding unsaved
work asked whether to discard changes the person had just watched it save.
Every field's baseline now moves to the new document's reading of its own path:
a field holding what the document says is no longer unsaved work, and an edit
the document does not have keeps its value and goes on saying it is unsaved.
