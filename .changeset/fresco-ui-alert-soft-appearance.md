---
'@codaco/fresco-ui': minor
---

Add an `appearance` prop (`solid` | `soft`) and an `accent` variant to `Alert`. `solid` (the default, unchanged) fills the alert with its intent colour; `soft` renders a low tint over the surface with surface text and an intent-coloured link, for quieter content-adjacent notices, and drops the pressed-in inset shadow so it reads flat. Role, aria-live, screen-reader label and icon are identical across appearances. The new `accent` variant is a non-semantic brand highlight for note/key-concept style callouts.
