---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

A skip-logic or filter rule is now a single control that says which rule it is.

**A rule card was a button inside a button.** The entity chip that starts every rule — "person", "Ego", an edge type — was itself a control, sitting inside the card's own "Edit rule" button along with several block elements a button is not allowed to contain. React logged the invalid nesting on every render, and a screen reader found two overlapping targets where the researcher sees one. The chip is now a picture of the entity rather than a control, so the card is one ordinary button and Enter and Space do one predictable thing. Holding a clipped entity-type name still reveals it in full.

**Every rule card used to be called "Edit rule".** In a list of five rules that gave a screen-reader user five identically-named buttons, and five identical "Delete rule" buttons beside them, with no way to tell which rule was about to be opened or deleted. Each control now reads the rule it acts on: "Edit rule: person where name is exactly equal to Dee".

**The rules are now a list**, so assistive technology can report how many there are and step between them, and the "and"/"or" separator between two rules reads as the word it is rather than as an empty form group.

**The rule builder now answers to its own field label.** The visible "Rules \*" label pointed at nothing, so the whole builder was anonymous to assistive technology, was never announced as required, and never named the error message shown beneath it. All of that is now connected, and the rule list marks itself invalid the way every other control does.

For consumers of `@codaco/fresco-ui`: `Node` takes a new `presentational` prop, which renders it as inert content instead of a control — for use inside something that already owns the interaction — and `IconButton` now accepts `aria-labelledby` as an alternative to `aria-label`.
