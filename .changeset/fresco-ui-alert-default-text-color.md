---
'@codaco/fresco-ui': patch
---

Fix `Alert`'s default variant applying no text colour. It referenced `text-contrast`, which is not a token the shared theme defines — every other variant pairs its background with a `{variant}-contrast` colour (`bg-info`/`text-info-contrast`, `bg-destructive`/`text-destructive-contrast`, and so on), but the default variant's `bg-surface` was left pointing at the nonexistent bare `contrast` token instead of `text-surface-contrast`. Text in a default-variant alert now gets the same explicit, theme-correct colour as every other variant instead of falling back to whatever colour it happened to inherit.
