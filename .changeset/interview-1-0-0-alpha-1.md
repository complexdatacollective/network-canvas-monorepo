---
"@codaco/interview": prerelease
---

Refactor: extract shared `actionButtonVariants` (circle, plus-badge, icon classes) used by `ActionButton`, `NodeForm`, and `QuickAddField`. Custom kebab-case icons and Lucide icons now size consistently across all three call sites — Lucide icons are constrained to `h-16` while custom icons fill the container. Storybook stories for `NodeForm` and `QuickAddField` now expose an `icon` control so all icons can be exercised interactively.
