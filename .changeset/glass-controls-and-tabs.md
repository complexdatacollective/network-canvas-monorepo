---
'@codaco/fresco-ui': minor
'@codaco/tailwind-config': minor
---

Add a compound `Tabs` component (Base UI-backed vertical tabs: import `Tabs` and `TabsPanel`; the rail is driven by a `tabs` array and renders its own active indicator).

Add a reusable "glass" control treatment — a new `control-glass` utility and `--control-border-width` token in the Tailwind config — exposed as a Button `glass` variant and a `SegmentedSwitcher` `variant` prop (`'outline'` default, `'glass'` opt-in). `SegmentedSwitcher` now defaults to an outline-button treatment, gains an `xl` size, and has its outer height and active-pill radius harmonised with Button.

`BaseField`'s inline layout is now driven by a container query rather than a viewport breakpoint, and `Table`'s `bodyScroll` region suppresses overscroll chaining (no rubber-band).

`InputField` now applies the caller's `className` to the field wrapper only, not to the inner `<input>` — so a background/backdrop passed to the field no longer double-applies onto the input.
