---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

The stage editor's shared sections and its form-family editors say what
Architect has always said. Section titles, descriptions, field labels, hints,
placeholders and empty states across the subject picker, stage filter, skip
logic, task introduction, page content, prompts, sort order, background, side
panels, quick add, the form-fields section and the attribute editor now match
the released wording word for word, in English and Spanish, and around sixty
invented hints and placeholders that Architect never showed are gone.

The stage filter's description now says what that section does: "Create rules
that filter which nodes or edges are displayed on this stage."

Three explanations come back with it. The background image picker and the
input-control picker link to their documentation pages again; choosing an
attribute that already exists explains why the list of input controls is short
("Attribute type is locked") and choosing a control for an attribute being
invented says which type it will create; and a form field's collapsed row
names its attribute type and input control in the reader's own language,
coloured by type, instead of showing a raw schema token.

A validation rule is now called the same thing everywhere: the names come from
`@codaco/protocol-validation`, which is what a protocol's own validation errors
already use.

Colour swatches announce the colour they are rather than their position in the
palette — "Sea Serpent" rather than "Node color 2" — for everyone choosing one
with a screen reader.
