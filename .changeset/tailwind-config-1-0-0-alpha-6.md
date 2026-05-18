---
'@codaco/tailwind-config': prerelease
---

Self-host Nunito and Inclusive Sans inside `themes/default.css` and `themes/interview.css` (latin subset only) instead of pulling them from Google Fonts via `@import url(https://...)`. The external `@import url(...)` calls cannot be hoisted by Vite/PostCSS once the theme files get inlined into a consumer bundle — the imports end up mid-bundle and violate the CSS spec rule that `@import` must precede every rule besides `@charset`/`@layer`. That broke `@codaco/interview`'s Storybook build with `@import must precede all other statements`. The bundled `@font-face` declarations point at woff2 files in the new `fresco/fonts/` directory, sourced from `@fontsource-variable/nunito` (variable wght 200–1000) and `@fontsource/inclusive-sans` (regular + italic at 400). Total ~64KB of font assets ship with the package.
