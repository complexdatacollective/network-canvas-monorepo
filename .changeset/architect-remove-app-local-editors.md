---
'@codaco/architect': minor
---

Architect now has one implementation of every stage-editing control rather than
two. The app's own copies of the field, rule, validation and parameter editors —
kept alongside the shared protocol-builder editor since Architect adopted it —
have been removed, along with the editing state they needed. Nothing a
researcher does changes: the same editors, the same wording, the same saved
protocol.
