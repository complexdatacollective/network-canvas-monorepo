---
'@codaco/fresco-ui': patch
---

Escape on the trigger of an open `ComboboxField`, `IconPicker` or
`LocaleSwitcher` now closes that list, not the dialog it sits in. With the
list open and focus back on its trigger (Shift+Tab out of the search box puts
it there), Escape used to close the whole dialog instead, taking the open list
with it. A keypress made before the list had taken focus did the same.

`ComboboxField` now manages whether its list is open itself, so it no longer
accepts `open` or `onOpenChange`. `onOpenChange` already had no effect, and
`defaultOpen` is still honoured.
