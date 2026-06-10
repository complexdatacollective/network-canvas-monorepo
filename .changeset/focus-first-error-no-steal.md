---
'@codaco/fresco-ui': patch
---

Fix `focusFirstError` stealing focus after a failed form submission. The 800ms
scroll fallback was never cancelled when `scrollend` fired (focusing the field
twice), and the deferred focus ran unconditionally — yanking focus back to the
first errored field even when the user had since clicked into another control.
The fallback timer is now cancelled by the `scrollend` path, and the deferred
focus is skipped when focus has moved since invocation.
