---
'@codaco/fresco-ui': patch
---

Focus state is now read correctly in another window's document, so a modal, a
form error, or a route change in UI rendered into an iframe or a popped-out
window no longer treats the control the user is on as unfocused and moves focus
off it.

The shared `holdsFocus` predicate identified elements with `instanceof`, which
only recognises the realm it was loaded in; every caller that accepts an
`ownerDocument` — `Modal`, `focusFirstError`, `RouteFocus` — could be handed an
element from another one. It and `asFinalFocusTarget` now ask the node what it
is, and answer exactly as before for everything in the host's own document.
