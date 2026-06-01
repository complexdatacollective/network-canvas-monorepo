---
'@codaco/fresco-ui': patch
---

Accessibility lint fixes: the `RangeFilter` min/max sliders and `ToggleField`
switch now expose accessible names, and `TimeAgo`'s click-to-toggle is a
keyboard-operable `role="button"` wrapper (Enter/Space) rather than a click
handler on the inert `<time>` element.

Dependency bumps: `immer` (→ ^11.1.8), `react-aria-components` (→ ^1.18.0),
`@base-ui/react` (→ ^1.5.0).
