---
'@codaco/fresco-ui': patch
---

Read-only checkboxes and toggle button groups no longer show hover and press affordances for a click they silently ignore. A read-only `Checkbox` (and the checkboxes rendered by `CheckboxGroup`) and a read-only `ToggleButtonGroup` option now stop responding to the pointer entirely — no hover state, no press animation — while remaining focusable and still announced as read-only to assistive technology.
