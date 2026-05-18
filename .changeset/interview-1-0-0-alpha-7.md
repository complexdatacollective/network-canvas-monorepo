---
'@codaco/interview': prerelease
---

Two changes that ride on `@codaco/tailwind-config@1.0.0-alpha.7`:

1. **Shell's interview theme attribute is now `data-theme-interview`** (was `data-interview`). The `<main>` element rendered by `Shell` carries this attribute, and the interview theme's selectors in `@codaco/tailwind-config` activate against it.

2. **Shell no longer self-imports the interview theme CSS.** Both themes now ship inside `@codaco/tailwind-config/fresco.css` (re-exported via `@codaco/fresco-ui/styles.css`), so any host that loads fresco-ui's styles already has the interview theme available. The previous explicit `import "@codaco/tailwind-config/fresco/themes/interview.css"` from `Shell.tsx` is gone.

E2E test fixtures and Storybook decorators in this package update their selectors to match the new attribute.
