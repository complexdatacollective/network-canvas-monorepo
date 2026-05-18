---
'@codaco/interview': prerelease
---

Document the canonical CSS chain in `dist/styles.css` more emphatically: importing `@codaco/interview/styles.css` is **mandatory** for any host loading the package — without it, Tailwind v4's auto-detection won't reach `node_modules/@codaco/interview/dist` and the stage interface utilities (`.interface`, ActionButton sizing, QuickAdd toggle dimensions, etc.) won't be generated, leaving components unstyled.

The header now also calls out the source-alias case explicitly: hosts that alias `@codaco/interview` at the package's `src` directory should still `@import` this file unless they've added their own `@source` covering the interview source tree, since Tailwind's auto-source scanner is rooted at the consumer's Vite root and won't always reach into a sibling package's source.

No runtime change. The single `@source "./**/*.{js,ts,tsx}"` directive that does the actual work is unchanged from `1.0.0-alpha.12`.
