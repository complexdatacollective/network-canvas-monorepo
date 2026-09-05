---
'@codaco/fresco-ui': minor
---

Add `messageRuleValidation`, which turns a plain validation function that returns a message into a field validation rule, so consumers without a schema library can attach blocking rules to array fields.

A custom field validation's `hint` is now optional. A rule that only speaks when it fails — "every option needs a unique value" — has nothing to promise a participant up front, and previously had no way to say so except an empty string, which the validation summary rendered as an empty bullet.
