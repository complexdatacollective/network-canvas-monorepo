---
'@codaco/fresco-ui': patch
---

A form now ignores a submit that arrives while its previous submission is
still running, so an async `onSubmit` is no longer called twice for one save.
`SubmitButton` and fields already disable themselves while a form submits,
but a second submit could still come from `form.requestSubmit()`, a submit
button that is not `SubmitButton`, or Enter in an input that is not a field.
Each one validated the form and called `onSubmit` again, saving the same
values twice. The ignored submit is still cancelled, so the page never
navigates. Once the submission finishes, whether it succeeds, returns errors,
throws or fails validation, the form accepts the next submit. A form reset
while its submission is still running, as `ResetFormWhenClosed` does when a
dialog closes, stays busy and disabled until that submission finishes, rather
than showing a submit button that does nothing.
