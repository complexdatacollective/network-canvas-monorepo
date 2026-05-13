---
"@codaco/tailwind-config": prerelease
---

Switch the `fresco/theme.css` `@theme` block to `@theme static`. Tailwind v4's default `@theme` only emits theme variables to `:root` when a generated utility class references them — Tailwind inlines them at the use-site otherwise. That breaks any code that uses `var(--color-*)` directly in arbitrary properties (e.g. `[--base:var(--color-node-1)]` in fresco-ui's `Node.tsx`), because the variable is never declared on `:root` and there's no fallback. `static` forces every declared theme variable to `:root` unconditionally, fixing the whole class of "arbitrary CSS-variable reference resolves to nothing" bugs at the design-system layer rather than per-component.
