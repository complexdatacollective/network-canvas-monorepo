---
'@codaco/tailwind-config': prerelease
---

Move `tailwindcss` from `dependencies` to `peerDependencies`. The package ships only CSS configuration (theme, plugins, color tokens) — the tailwindcss compiler always runs in the consumer's tooling context (`@tailwindcss/vite` or PostCSS), never inside tailwind-config itself. Peer status better reflects that runtime relationship and avoids any chance of duplicate tailwindcss installs if a consumer pins a different version range.

`@tailwindcss/forms` and the `@fontsource-variable/*` packages remain in `dependencies` because their paths are resolved relative to the CSS files (Tailwind v4's `@plugin` directive and font `url()` references).

**Breaking** for consumers that previously received `tailwindcss` transitively — they must now declare it themselves. The catalog entry `tailwindcss: ^4.2.4` keeps versions aligned across the workspace.
