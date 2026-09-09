---
'@codaco/fresco-ui': minor
---

Added `ColorPickerField`, a palette of named colour swatches chosen one at a
time. It is a Field component, so it carries the form system's value,
validation, error, label and hint contract, is fully operable from the keyboard,
and marks the chosen swatch with an outline ring that reads without perceiving
colour.

`ArrayField` gains two additions: `itemTemplate` is now optional, so a list
whose every field is answered in its row editor adds an empty row instead of
passing a template it has no use for; and `itemLabel` lets a list name its own
rows, so the delete confirmation asks "Delete this prompt?" rather than the
generic "Are you sure?".
