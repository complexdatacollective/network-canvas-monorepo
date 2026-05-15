---
'@codaco/fresco-ui': minor
---

Drop the `interview:` and `dashboard:` `@custom-variant` declarations from `dist/styles.css`. They moved to `@codaco/tailwind-config/fresco.css` (1.0.0-alpha.2) and are now picked up transitively via the existing barrel import. No behavior change for consumers — fresco-ui's CSS entry still exposes the same set of variants and utilities.
