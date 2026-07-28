---
'@codaco/architect': patch
---

Variable pickers no longer offer variables that would end up written both with and without validation: form-field pickers exclude variables already written by a bin, sociogram highlight, census, or other direct writer, and those stages' pickers exclude form-collected variables (the current selection always stays available). Saving a stage that would create such a pairing is refused with an explanation of why. Protocols that already contain one show a warning on the protocol timeline listing each affected variable and the stages involved, with a badge on the Stages tab — nothing blocks opening, editing, or exporting. Newly created "other" and quick-add variables default to required.
