---
"@codaco/architect": patch
---

The variable validation editor now prevents contradictory rules at authoring
time: contradictory drafts cannot be saved and explain why, reference pickers
only offer targets that keep the rules satisfiable, the whole field dialog is
checked on save (e.g. deleting an option out from under `minSelected`), and a
hint appears when `unique` is applied to a variable with only a few possible
values.
