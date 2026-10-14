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
one for when it is not; in the editor it shows as its pill, and opens to show
those versions when it is selected. A choice or yes/no value can give the text one
version for each answer; a yes/no value shows as words only once both of
its answers have labels, so until then the menu lists it greyed out with a
hint to add them (a Toggle, which has no labels, points to the
different-wording entry instead). A number can give it a version for each plural form
of the language. Values show as pills in the stage editors, the translation
table and the protocol summary. A translation that leaves out a value is
flagged with the value's name, and neither the table nor the stage editor
will save it. Text that
shows values a field cannot edit is shown as it is, with a note saying why.

- `@codaco/fresco-ui`'s rich text editor opens its insert menu from an icon
  button (a database icon, named and tipped by the menu's label), and every
  placeholder pill, in the editor and in `TokenPill`, opens with the same
  icon, held on one line with the label's first word; in the editor a pill
  shows a pointer. The editor accepts an insert menu (`RichTextInsertMenu`,
  whose items can be `disabled` with a description saying why), inline value
  pills, and a versions element for text with one version per case. The
  versions element shows as a pill (its optional `summary`, or its `label`)
  and opens to show its versions while it is selected: clicked, reached with
  the keyboard, or just inserted. Enter or Space opens it, Escape folds it,
  and leaving the field folds it.
- `@codaco/protocol-validation` exports `messageStructure` and
  `printMessageStructure`, which turn an ICU message into the tree of
  versions the editor shows and back, and `pluralValueExamples`, the plural
  categories a number answer can reach in a language, fractions included.
  It also exports `collectLocalizedStringsFromSchema`, which finds the
  localized strings of any value against the schema given, such as one
  stage against `stageSchema`.
