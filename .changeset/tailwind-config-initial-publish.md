---
'@codaco/tailwind-config': minor
---

Initial publish to npm. Now consumable by external apps via `@codaco/fresco-ui`'s CSS imports (`@import "@codaco/tailwind-config/fresco/theme.css"`, `@plugin "@codaco/tailwind-config/fresco/plugins/elevation/elevation"`, etc.). Tailwind v4 loads the TypeScript plugin entrypoints directly via its bundled `jiti` loader, so no build step ships compiled JS — the TS sources are published as-is.
