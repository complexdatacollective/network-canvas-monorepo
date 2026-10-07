---
'@codaco/fresco-ui': minor
---

Form dialogs (`type: 'form'`) opened through `useDialog` accept an optional
`onSubmit` with the same contract as a `Form`'s own submit handler. When it
returns a failed result, the dialog stays open with the values as entered and
shows the result's errors in the form, so the submission can be retried. Only a
successful result closes the dialog and resolves it with the values. Dialogs
without `onSubmit` behave as before.
