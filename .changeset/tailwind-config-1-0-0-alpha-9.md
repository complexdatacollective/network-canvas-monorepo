---
'@codaco/tailwind-config': prerelease
---

Add the foundational base-layer rules and the global reduced-motion override that previously had to be redeclared by every consumer. They now ship as part of `fresco/utilities.css`, so any package that imports `@codaco/tailwind-config/fresco.css` (transitively or directly) inherits them.

- `@media (prefers-reduced-motion: reduce)` zeroes `animation-duration`, `animation-delay`, `transition-duration`, and `transition-delay` on `*`/`*::before`/`*::after`. Consumers no longer need their own copy of this media query — `useReducedMotion()` and motion-gated CSS classes are enough on top of this baseline.
- Universal `border-outline` default on `*`, `::after`, `::before`, `::backdrop`, `::file-selector-button` so unstyled borders pick up the theme outline color instead of Tailwind v4's `currentColor` fallback.
- `body` defaults: `bg-background text-text publish-colors font-body` plus `position: relative` (a Base UI v26 Safari workaround documented at base-ui.com/react/overview/quick-start#ios-26-safari).
- Inline-semantic defaults so consumers can use `<strong>`, `<em>`, `<s>`, `<u>`, `<hr>`, and `<kbd>` from rich-text content without restyling each one. `strong` nested inside headings escalates to `font-black tracking-normal`; nested inside `<label>` it gets `font-black tracking-wide`.
- `.lucide` icons get `stroke-width: 2.5px` for visibility against light surfaces.

No token, plugin, or theme-variant changes.
