---
'@codaco/art': patch
---

`Pattern` now renders a plain platinum-dark surface when `seed` is an empty
string, instead of generating a pattern from an empty input. The `className`
and `style` props are also forwarded to the underlying pattern component.
