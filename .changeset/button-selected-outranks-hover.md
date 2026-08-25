---
'@codaco/fresco-ui': patch
---

Hovering a `Button` that is already selected no longer repaints it. A toggle that is on, a disclosure that is open, and a control using the `selected` prop all keep their selected colours under the pointer — previously the hover treatment painted over them, so a menu trigger stopped looking open while the pointer rested on it, which is exactly when a researcher is most likely to be looking at it.

A call site's own selected treatment now stands unopposed on hover too, including a quieter one such as `aria-expanded:bg-selected/15`. A call site's explicit `ui-enabled:hover:…` is still honoured, and unselected buttons are unchanged.
