---
"@codaco/tailwind-config": patch
---

Scope the `focus-styles` transition to the outline properties it animates. `transition-all` captured every property on a `:focus-visible` element, re-tweening each frame of script-driven animations (a node's press scale, a dragged node's position) through a 200ms ease and smearing them visibly behind the input.
