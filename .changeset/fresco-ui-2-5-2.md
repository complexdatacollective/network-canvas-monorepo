---
"@codaco/fresco-ui": patch
---

Sync with `@codaco/tailwind-config@1.0.0-alpha.7`:

- `dist/styles.css` documentation is updated — both theme variants now ship inside `@codaco/tailwind-config/fresco.css`, so consumers no longer need to import `themes/default.css` or `themes/interview.css` separately.
- `@source` directive widened from `./**/*.js` to `./**/*.{js,ts,tsx}` (no-op for published consumers — `dist/` only contains `.js` — but lets workspace-internal hosts that consume `src/styles.css` directly pick up source files).
- Storybook decorator updated for the `data-interview` → `data-theme-interview` rename in tailwind-config alpha.7, and drops its own redundant theme imports now that fresco.css bundles them.

No component or runtime behavior changes for consumers.
