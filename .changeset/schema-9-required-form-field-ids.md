---
'@codaco/protocol-validation': minor
'@codaco/protocol-utilities': minor
'@codaco/development-protocol': patch
'@codaco/sample-protocol': patch
---

Every form field in a schema 9 protocol now has an `id`. Upgrading a protocol
from schema 8 gives an id, such as `field-1`, to every form field that has none
and keeps the ids fields already have, so no protocol is refused for lacking
them. Architect already gave each field it adds an id.

For developers: in schema 9, `FormFieldSchema.id` is a required non-empty
string, and a form (`FormSchema`, `TitlelessFormSchema`, `FormFieldArraySchema`)
refuses two fields with the same id (the error names the repeat, at its `id`).
Network Composer fields are unchanged and keep an optional id. The schema 9
sample and development protocols carry ids, and `SyntheticInterview` gives
every form field it builds one.
