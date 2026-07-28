---
"@codaco/interview": patch
---

Form analytics now report each field's real input control. `form_opened` and
`form_validation_failed` read the control from the codebook variable rather
than from the form field, which never carried one — so every field was
previously recorded as `unknown`. Event shapes are unchanged.
