---
'@codaco/fresco-ui': minor
---

`BaseField` is now exported at `@codaco/fresco-ui/form/Field/BaseField`. It is the
markup `Field` already renders around a control — the field's label, hint,
requiredness marker and error region — and exporting it lets a caller compose
that markup around a control it binds itself, instead of reimplementing the parts
an outline or an issues panel reads a field's name and requiredness from.

A form's "jump to the first problem" now finds a field rendered outside the
`<form>` element. `focusFirstError` resolves each errored field within the form
first and only then looks for the ones the form does not contain; previously it
consulted the wider document only when the form held none of them, so a field
outside the form was skipped whenever a field inside it was also wrong. A field
the form does contain is still never looked up elsewhere.
