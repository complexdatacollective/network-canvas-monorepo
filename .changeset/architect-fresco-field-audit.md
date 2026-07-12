---
'@codaco/architect': patch
---

Audited and hardened Architect's migration to the fresco-ui field system, and reworked the "map variable to shape" editor.

Form fixes: clearing a numeric field (e.g. a maximum-alters limit) no longer stores an empty string over the intended empty value; integer fields reject exponent/decimal input that previously stored a silently wrong number; categorical rule operands in filters and skip logic keep their selected values instead of being dropped on save; and dialog editors no longer let a native browser validation bubble pre-empt the styled, scrollable error display. Rule editors, protocol notes and stage previews now render markdown through the shared renderer, and the query-rule editors use a lighter controlled field wrapper.

Styling and accessibility: field error states use a border cue rather than repainting whole rows, several date and relative-date inputs gained accessible names, and dead legacy styling was removed.

Map variable to shape: the threshold editor is now a fresco editable list — add, remove, and inline-edit thresholds, capped by the number of available shapes. Threshold inputs are configured per variable type (scalar variables step across their normalised 0–1 range; number variables use their own range). The default-shape row, threshold rows, and shape choosers were restyled to match, with a node-coloured selection ring on the shape and colour pickers.
