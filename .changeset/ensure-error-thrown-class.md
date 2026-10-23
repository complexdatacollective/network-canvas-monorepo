---
'@codaco/shared-consts': patch
---

`ensureError` now returns a real `Error` when the thrown value is an Error class rather than an instance (for example `throw ValidationError` instead of `throw new ValidationError()`). It used to return the class itself: a function, with no message or stack trace of its own.
