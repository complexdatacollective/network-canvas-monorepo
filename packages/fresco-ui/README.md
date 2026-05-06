# @codaco/fresco-ui

Fresco UI components, styles, and utilities. See `docs/superpowers/specs/2026-04-29-fresco-ui-package-design.md` for the design spec and `docs/superpowers/plans/2026-04-29-fresco-ui-package.md` for the implementation plan.

---

## Install

```sh
pnpm add @codaco/fresco-ui
```

**Peer dependencies** (you most likely already have these):

```jsonc
{
  "@base-ui/react": "^1.4.0",
  "@codaco/shared-consts": "5.0.0",
  "@codaco/tailwind-config": "^1.0.0-alpha.11",
  "immer": "^11.1.4",
  "motion": "^12.38.0",
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "tailwindcss": "^4.2.4",
  "zod": "^4.1.13",
  "zustand": "^5.0.12",
}
```

## Tailwind / CSS setup

The package assumes the host has a Tailwind v4 build plugin wired up
(`@tailwindcss/vite` for Vite, `@tailwindcss/postcss` for Next.js / any
PostCSS pipeline). Each CSS file in the chain owns one concern, and
consumers import them in order:

```css
/* styles/globals.css */
@import "@codaco/tailwind-config/fresco.css"; /* Tailwind v4 + theme + plugins + fonts */
@import "@codaco/fresco-ui/styles.css";       /* @source for fresco-ui's dist */
```

If you also use `@codaco/interview`, add its CSS file too — see that
package's README:

```css
@import "@codaco/interview/styles.css";
```

**Do not also `@import "tailwindcss"` yourself.** That import lives
inside `@codaco/tailwind-config/fresco.css`; adding it again loads
Tailwind's runtime twice and produces duplicate / conflicting
utilities.

`@codaco/fresco-ui/styles.css` is intentionally tiny — its only content
is a single `@source "./**/*.{js,ts,tsx}"` directive that tells
Tailwind v4's class scanner to walk the package's compiled JS in
`dist/` so it emits the utility classes the components reference. It
does **not** re-export the design-system foundation, so the
`tailwind-config` import is not optional.

`@codaco/tailwind-config/fresco.css` bundles the default and interview
theme variants together with self-hosted Nunito and Inclusive Sans
woff2 files. The interview theme only activates when an element on the
page sets the `data-theme-interview` attribute — typically
`@codaco/interview`'s `Shell` component, while it's mounted; otherwise
the default theme is active.

## Public API surface

The `exports` field in `package.json` is an explicit allowlist. Add new entries there when shipping new modules. Internals (collection/store, button-constants, etc.) are intentionally excluded — anything not listed in `exports` is package-private even if Vite compiles it into `dist`.
