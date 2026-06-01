---
'@codaco/fresco-ui': patch
---

`LikertScale` and `VisualAnalogScale` slider thumbs no longer create a duplicate tab stop. `motion` auto-adds `tabIndex={0}` to a `whileTap` element, so the thumb `<div>` became focusable alongside base-ui's nested `<input type="range">` — giving two tab stops per slider. The thumb `<div>` is now `tabIndex={-1}`, leaving the input as the single focus target.
