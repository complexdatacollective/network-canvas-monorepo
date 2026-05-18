---
'@codaco/interview': prerelease
---

Add a published CSS entry: `@codaco/interview/styles.css` (resolves to `dist/styles.css`). It contains a single `@source "./**/*.{js,ts,tsx}"` directive scoped to the package's compiled JS, so consumers no longer hand-roll `@source '../node_modules/@codaco/interview/dist/**/*.js'` in their globals.

This pairs with the parallel `@codaco/fresco-ui@2.6.0` cleanup. Each CSS file in the chain now owns one concern: tailwind-config owns Tailwind v4 + theme + plugins + fonts, fresco-ui owns its scanner glue, and interview owns its scanner glue. Consumer entry CSS becomes:

```css
@import '@codaco/tailwind-config/fresco.css';
@import '@codaco/fresco-ui/styles.css';
@import '@codaco/interview/styles.css';
```

The interview package's vite build now copies `src/**/*.css` verbatim into `dist/` via a `cssCopyPlugin` (mirroring fresco-ui), so the `@source` directive ships through with its path intact.
