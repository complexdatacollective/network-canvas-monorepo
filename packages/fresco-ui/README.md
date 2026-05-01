# @codaco/fresco-ui

Fresco UI components, styles, and utilities. See `docs/superpowers/specs/2026-04-29-fresco-ui-package-design.md` for the design spec and `docs/superpowers/plans/2026-04-29-fresco-ui-package.md` for the implementation plan.

## Public API surface

The `exports` field in `package.json` is an explicit allowlist. Add new entries there when shipping new modules. Internals (collection/store, button-constants, etc.) are intentionally excluded — anything not listed in `exports` is package-private even if Vite compiles it into `dist`.
