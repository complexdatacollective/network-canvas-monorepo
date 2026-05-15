---
'@codaco/tailwind-config': major
---

**Breaking**: 1.0 alpha. Reorganize the package's exports surface.

- The published tarball now ships only the `fresco/` directory (per the `files` field). All foundation files (colors, theme, utilities, plugins) live there.
- `./fresco.css` (the public path) maps to `./fresco/fresco.css` (the file). It's the single barrel for colors + theme tokens + utilities + plugins. Replaces individual `@import` directives for each piece.
- Theme variants live at `./fresco/themes/default.css` and `./fresco/themes/interview.css` (default loads Nunito + Inclusive Sans; interview loads Nunito only).
- Removed from `exports`: `./fresco/colors.css`, `./fresco/theme.css`, `./fresco/utilities.css`, `./fresco/fonts.css`, `./fresco/default-theme.css`, `./fresco/interview-theme.css`, `./base`, `./globals.css`, the individual `./fresco/plugins/*` paths, and the legacy `./fresco` TypeScript entry. These were either internal implementation details (the foundation pieces) or unused legacy entries.

Consumers should import:

```css
@import 'tailwindcss';
@import '@codaco/tailwind-config/fresco.css';
@import '@codaco/tailwind-config/fresco/themes/default.css'; /* or interview.css */
```
