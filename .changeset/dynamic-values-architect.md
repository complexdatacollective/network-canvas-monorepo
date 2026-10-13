---
'@codaco/architect': minor
'@codaco/fresco-ui': minor
'@codaco/protocol-validation': minor
---

Architect can put values the interview fills in into participant text: for
example the participant's name, a person's answer, the two people a census
asks about, or today's date. Each text that accepts values has an "Insert a
value" button in its toolbar, with a searchable menu that lists only the
values available where that text sits. Typing `{` opens the same menu. A
value that can be missing goes in with a version for when it is known and
one for when it is not. A choice or yes/no value can give the text one
version for each answer. A number can give it a version for each plural form
of the language. Values show as pills in the stage editors, the translation
table and the protocol summary. A translation that leaves out a value is
flagged with the value's name, and the table will not save it. Text that
shows values a field cannot edit is shown as it is, with a note saying why.

- `@codaco/fresco-ui`'s rich text editor accepts an insert menu
  (`RichTextInsertMenu`), inline value pills, and a versions block for text
  with one version per case.
- `@codaco/protocol-validation` exports `messageStructure` and
  `printMessageStructure`, which turn an ICU message into the tree of
  versions the editor shows and back.
