---
'@codaco/fresco-ui': major
---

Form values now include only registered fields. `getFormValues()` — and therefore submitted values, validation context, and wizard finish payloads — no longer merges values from unmounted (dormant) fields. A field hidden by conditional rendering (`FieldGroup`) contributes nothing to the form's output while hidden. Dormant storage still restores a field's value when it remounts, and `getFieldState`/`useFormValue` still fall back to it for cross-step reads.

Wizard dialogs now accumulate each step's values as you navigate (forward, back, or jumping), so multi-step wizards continue to resolve with every step's answers under the new semantics. A revisited step's answers wholly replace what was previously recorded for its fields, which also fixes stale repeated-entry arrays surviving a reduced count.

`setFieldValue` on an unregistered field name now stages a pending value that takes effect when the field next mounts, instead of warning and discarding the write.
