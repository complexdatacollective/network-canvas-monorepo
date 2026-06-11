---
'@codaco/fresco-ui': minor
---

Add `warning` intent variant to dialogs. Warning dialogs use an amber accent
and auto-focus the cancel button (same as `destructive`), making them suitable
for discouraged-but-not-destructive actions. The `confirmCancel` option on
`WizardDialog` now accepts an optional `intent` field (defaults to `default`).
