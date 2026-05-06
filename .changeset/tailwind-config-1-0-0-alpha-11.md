---
"@codaco/tailwind-config": prerelease
---

Move `@import "tailwindcss"` into `fresco/fresco.css`. The foundation package now owns the Tailwind v4 runtime entry directly, so any consumer of `@codaco/tailwind-config/fresco.css` gets a complete, runnable Tailwind setup with theme tokens, plugins, fonts, and variants — no second package required.

This is also the primary build of the package's first Vite-bundled release: `@fontsource-variable/{nunito,inclusive-sans}` are now devDependencies (build-time only), bundled woff2 files ship in `dist/shared/fonts/` with hashed names and relative `url(./...)` references, and the Tailwind plugins compile to `dist/shared/plugins/` and resolve via bare specifiers (`@plugin "@codaco/tailwind-config/plugins/elevation"`). The exports field is updated accordingly. Consumers' published CSS no longer hand-rolls `/fonts/...` paths — assets are emitted relative to the CSS file by Vite, which fixes the Chromatic 404 caused by static deploys serving Storybook under a hashed (non-root) path.

**Breaking** for consumers that import `@codaco/tailwind-config/fresco.css` *and* additionally `@import "tailwindcss"` themselves: that combination now loads Tailwind twice. Drop the redundant `@import "tailwindcss"` from your CSS entry.
