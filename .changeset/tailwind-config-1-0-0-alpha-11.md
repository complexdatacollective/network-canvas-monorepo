---
"@codaco/tailwind-config": prerelease
---

Move `@import "tailwindcss"` into `fresco/fresco.css`. The foundation package now owns the Tailwind v4 runtime entry directly, so any consumer of `@codaco/tailwind-config/fresco.css` gets a complete, runnable Tailwind setup with theme tokens, plugins, fonts, and variants — no second `@import "tailwindcss"` required.

Restore the `@plugin` directives for `elevation` and `inset-surface` in `fresco/fresco.css`. They had been commented out in earlier alphas: the directive paths resolved to directories rather than files, so Tailwind couldn't load them and the design system's elevation / inset-surface utilities silently dropped out. Each plugin directory now contains an `index.ts` that re-exports the plugin's default, so the directory-based `@plugin "../shared/plugins/elevation"` path resolves to that index entry. `motion-spring` already lived as a flat file at the resolved path and is unaffected.

Housekeeping: drop a leftover `@utility publish-colors` stub from `utilities.css`; remove an unused `vite` devDep (the package ships source CSS via the `exports` field, no Vite build is wired up); and quote the `url(@fontsource-variable/...)` references in the published font CSS so they parse under strict CSS parsers.

**Breaking** for consumers that import `@codaco/tailwind-config/fresco.css` *and* additionally `@import "tailwindcss"` themselves: that combination now loads Tailwind twice. Drop the redundant `@import "tailwindcss"` from your CSS entry.
