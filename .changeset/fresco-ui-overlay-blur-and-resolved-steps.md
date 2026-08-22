---
'@codaco/fresco-ui': minor
---

Form fields no longer validate when one of their own controls opens a picker,
menu or dialog. Opening an attribute picker used to count as leaving the field,
so a half-finished entry turned red while the person was on their way to
finishing it — and the redraw that followed could swallow the click that would
have finished it, making a first selection appear not to register. Fields still
validate when focus really leaves them, and when the form is saved.

Number fields can also bring their own stepping arithmetic (`resolveStep` on
`InputField`), so the +/- buttons and the arrow keys work for a field whose
valid range an `<input type="number">` cannot state — one that is open-ended,
excludes a bound, or accepts any value in its range.
