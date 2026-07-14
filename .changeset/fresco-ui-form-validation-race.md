---
'@codaco/fresco-ui': patch
---

Fix a form-store race where a field's in-flight async validation, superseded by a sibling field's value change, was silently dropped and never rescheduled. The field (and therefore the whole form) stayed invalid with no visible error until the next full form validation. `setFieldValue` now revalidates superseded sibling validations against the updated form values, while stale results from the pre-change snapshot are still discarded.
