---
'@codaco/architect': minor
---

Every stage editor is now the shared protocol-builder editor, and Architect has
one implementation of every stage-editing control rather than two. Each
interface keeps the same sections, fields and saved protocol, and gains a
section outline that says which parts of the stage still need attention. Undo
and redo now cover saved changes to the protocol rather than unsaved typing
inside an editor, and changes made to the codebook while a stage is open are
kept when the stage edit is cancelled — an attribute belongs to the codebook
every stage collecting it shares, not to the one stage being edited.

Rules that contradict each other are now reported in the words that say what to
do about them, rather than the technical diagnostic written for a validation
report. A protocol that has recorded nothing about the participant yet can now
gain its first list-of-answers or scale attribute from a form field, and a new
node or edge type takes the next colour in its palette rather than always the
first.

The app's own copies of the field, rule, validation and parameter editors have
been removed, along with the editing state they needed. The printable protocol
summary now reads a rule back in the same words the rule list does. One sentence
changes: a rule asking whether the participant has answered one of their own
attributes at all printed as "Ego where Age", a clause with nothing after it,
and now prints as "Ego has Age". Every other rule reads as it did, and nothing
about a saved protocol changes.
