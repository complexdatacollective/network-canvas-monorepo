---
"@codaco/architect": patch
---

The variable validation editor now prevents contradictory rules at authoring
time: contradictory drafts cannot be saved and explain why, reference pickers
only offer targets that keep the rules satisfiable, the whole field dialog is
checked on save (e.g. deleting an option out from under `minSelected`), and a
hint appears when `unique` is applied to a variable with only a few possible
values. Codebook edits are also checked against the current shared form and
every NetworkComposer stage-effective control overlay, and integer validation
bounds reject fractional values directly in the editor. Network Composer group
variables are kept separate from validated form fields, including in the Life
Transitions template.

Relative date anchors in years 0001 through 0099 now remain selectable and
valid in the editor, matching the protocol schema and interview runtime.
