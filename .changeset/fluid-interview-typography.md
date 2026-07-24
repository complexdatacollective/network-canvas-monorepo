---
"@codaco/tailwind-config": minor
"@codaco/interview": patch
---

Refine interview typography scaling and unify the type-scale base.

The shared Fresco theme now uses a single `0.9rem` base for `--theme-root-size`
across product surfaces, and exposes a new `--theme-root-size-fluid` token — an
opt-in `clamp()` ramp for presentation surfaces that want type and spacing to
grow on wide or scaled-up displays. The participant interview adopts the shared
`0.9rem` base and scales it with a continuous ramp (reaching ~`1rem` at typical
screen sizes and up to `1.25rem` on large displays), replacing the previous
three-step ramp. Dense product UI keeps a constant, compact base.

Also fixes the scroll-to-bottom "ready" detection in scrolling forms
(`useScrolledToBottom`): it now measures scroll position directly instead of
relying on a zero-height sentinel's edge intersection, which some browsers
(notably Firefox) fail to report when the form is scrolled to the exact bottom —
so the "ready to continue" cue reliably appears.
