---
'@codaco/fresco-ui': patch
---

`SubmitButton` now stays disabled while its form is submitting, even when the
caller passes its own `disabled`. A caller's `disabled` used to replace the
submitting state, so a button given `disabled={false}` (or any condition that
was false at the time) stayed enabled during a submit: it showed its spinner
but kept its enabled styling and accepted clicks, even though a second click
did nothing. A caller's `disabled` now adds to the submitting state instead of
overriding it.
