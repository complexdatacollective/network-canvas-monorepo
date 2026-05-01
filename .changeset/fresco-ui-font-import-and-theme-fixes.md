---
"@codaco/fresco-ui": patch
---

Order the Google Fonts `@import` before `@import "tailwindcss"` in `styles.css` so the nested `@import url('https://fonts.googleapis.com/...')` lands at the top of the compiled CSS stream — `@tailwindcss/postcss` expanded `tailwindcss` into rules and pushed the url() past them, breaking consumer apps with "@import rules must precede all rules" errors.

Also: wire `@tailwindcss/vite` into Storybook + Vitest, repair the interview-theme `--warning` color, paint the themed body background and register `interview:` / `dashboard:` variants, and quiet autodocs canvas CSS warnings.
