---
'@codaco/architect': patch
'@codaco/fresco-ui': minor
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
outlined and washed in that type's colour, instead of showing a raw schema
token. Outlined rather than filled: white on the filled colour is below the
contrast a reader is owed for text that size on four of the nine attribute
types.

A validation rule is now called the same thing everywhere: the names come from
`@codaco/protocol-validation`, which is what a protocol's own validation errors
already use.

Colour swatches announce the colour they are rather than their position in the
palette — "Sea Serpent" rather than "Node color 2" — for everyone choosing one
with a screen reader. Architect's own colour picker in the codebook reads its
swatch names from the same list, so the two announce a swatch identically.

For anyone building on `@codaco/fresco-ui`: a field's hint is now given to
`Hint` as its `hint` prop, with a field's validation summary as a separate
`validationSummary` prop, so a field carrying both keeps them as two
paragraphs. Passing the hint as children still works and renders as before.
A `Badge` given both a `color` and `variant="outline"` now reads in the surface's
own text colour instead of the theme colour, which most of the palette does not
reach 4.5:1 against a wash of itself; the colour is still the badge's border
and background.
