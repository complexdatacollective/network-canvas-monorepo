---
'@codaco/fresco-ui': minor
---

`src/styles.css` is now Tailwind-class-scanner glue only — it contains a single `@source "./**/*.{js,ts,tsx}"` and nothing else. The `@import "@codaco/tailwind-config/fresco.css"` line is removed. This makes each CSS file in the chain own one concern: tailwind-config owns Tailwind v4 + theme, fresco-ui owns the @source for fresco-ui's compiled JS, and (per the parallel `@codaco/interview@1.0.0-alpha.12` change) interview owns its own scanner glue.

**Breaking** for consumers that previously relied on `@codaco/fresco-ui/styles.css` to transitively pull in the design-system foundation. Update your entry CSS to import both, in this order:

```css
@import '@codaco/tailwind-config/fresco.css';
@import '@codaco/fresco-ui/styles.css';
```

If you also use `@codaco/interview`, add a third line:

```css
@import '@codaco/interview/styles.css';
```

Hosts no longer need to hand-roll `@source '../node_modules/@codaco/fresco-ui/dist/**/*.js'` lines — each package's own CSS file owns its scanner directive, relative to that package's `dist/`.
