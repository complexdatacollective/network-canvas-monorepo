---
'@codaco/fresco-ui': patch
---

`DropdownMenuRadioItem` shows its default tick only on the checked item. Every
item still keeps the tick's space, so the labels stay aligned. An item given
its own `icon` (such as a sort direction or a theme) always shows it, and the
checked item is marked by its highlight.
