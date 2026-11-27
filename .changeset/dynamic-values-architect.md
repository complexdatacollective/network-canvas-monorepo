---
'@codaco/architect': minor
'@codaco/fresco-ui': minor
'@codaco/protocol-validation': minor
---

Architect can put values the interview fills in into participant text: for
example the participant's name, a person's answer, the two people a census
asks about, or today's date. Each text field that accepts values has an
**Attribute** button in its toolbar, with a searchable list of only the values
available in that field. Typing `{` opens the same list. In the editor, a value
shows as a pill, and a value that is missing during the interview shows
nothing. Inserting, removing and editing values can be undone and redone like
any other edit, and a value's pill can be dragged to another place in the
text. A yes/no value shows as words only once both of its answers have
labels, so until then the list shows it greyed out with a hint to add them
(for a Toggle, which has no labels, the hint suggests a dynamic attribute
instead). Values show as pills in the stage editors, the translation
table and the protocol summary. The text refers to each attribute, option
and set of rules by its id, so a pill shows the attribute's current name,
and renaming an attribute or relabelling an option leaves the text as it is. Showing a value is optional in every
language: a translation may leave out a value the default-language text
shows. An attribute that a piped value shows cannot be deleted
from the codebook, including while the stage that shows it is still unsaved.
A problem with piped text names each value as the researcher knows it, by
the attribute's name, and never by its id. A protocol whose text refers to an
attribute that is no longer in the codebook is refused with "This wording refers
to an attribute that no longer exists.", and one whose text has a version for
a deleted option with, for example, "This wording chooses between versions by the
"Pets" attribute of the participant, but one of its versions is for an option
that no longer exists." A protocol whose formatted text has a value
inside a link address is refused too. When a stage
is not saved because of its piped text, the first field with a problem takes
focus.

- `@codaco/fresco-ui`'s rich text editor accepts insert tools from its host
  (`insertTools`, which are given the editor's commands, which put values,
  versions and blocks into the text; typing `{` opens the host's list of
  values), inline value pills, and a versions element
  for text with one version per case. The
  versions element shows as a pill (its optional `summary`, or its `label`)
  and, while it is selected (clicked, reached with the keyboard, or just
  inserted), shows its versions in the pill's place, one to a row in the
  order given, an empty one with a muted "Shows nothing" hint that is not
  saved. Enter or Space opens it, Escape folds it, and leaving the field
  folds it. A version's edits belong to the field's undo history, undone and
  redone from the version or the line around it, and a value chosen from the
  host's list hands the caret back to the text (`returnFocus`). The editor keeps its history when a host
  passes the same placeholders in another order.
- `@codaco/protocol-validation` exports `messageStructure` and
  `printMessageStructure`, which turn an ICU message into the tree of
  versions the editor shows and back, and `pluralValueExamples`, the plural
  categories a number answer can reach in a language, fractions included.
  It also exports `collectLocalizedStringsFromSchema`, which finds the
  localized strings of any value against the schema given, such as one
  stage against `stageSchema`.
