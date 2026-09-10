---
'@codaco/architect': minor
---

Architect now has one implementation of every stage-editing control rather than
two. The app's own copies of the field, rule, validation and parameter editors —
kept alongside the shared protocol-builder editor since Architect adopted it —
have been removed, along with the editing state they needed.

The printable protocol summary now reads a rule back in the same words the rule
list does. One sentence changes: a rule asking whether the participant has
answered one of their own attributes at all printed as "Ego where Age", a clause
with nothing after it, and now prints as "Ego has Age". Every other rule reads
as it did, and nothing about a saved protocol changes.
