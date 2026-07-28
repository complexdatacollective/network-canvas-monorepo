---
"@codaco/interview": patch
---

`useProtocolForm` now precomputes the RelativeDatePicker submission-time
min/max window even when a protocol field or variable omits `parameters`
entirely. The rendered control always applies its default window (before =
180 days, after = 0, anchor = today) regardless of whether the record is
absent or empty, but the submission-time validator was previously only
derived when `parameters` was present — so a keyboard-typed date outside the
default window could bypass validation and be submitted. Absent and `{}`
`parameters` now behave identically, matching
`@codaco/protocol-validation`'s contradiction analyser.
