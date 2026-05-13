---
"@codaco/tailwind-config": minor
---

Reorganize Fresco design-system CSS exports.

- **NEW**: `./fresco.css` is now the single foundation entry — bundles colors, theme tokens, utilities, and plugins. Replaces having to import the four pieces individually.
- **MOVED**: theme variants live in `./fresco/themes/`. Update `./fresco/default-theme.css` → `./fresco/themes/default.css` and `./fresco/interview-theme.css` → `./fresco/themes/interview.css`.
- **REMOVED**: `./fresco/fonts.css` is gone. Font @imports are inlined into the theme files (Nunito + Inclusive Sans in `default.css`; only Nunito in `interview.css`) since the font set is part of a theme's identity.
- **REMOVED from exports**: `./fresco/theme.css`, `./fresco/colors.css`, `./fresco/utilities.css`. These are now internal — consume via the `./fresco.css` barrel.

Bumped to 0.5.0 (pre-1.0 minor for breaking changes).
