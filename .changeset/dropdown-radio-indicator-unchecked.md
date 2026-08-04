---
"@codaco/fresco-ui": patch
---

Hide the check indicator on unchecked `DropdownMenuRadioItem`s. The indicator
is kept mounted to preserve label alignment, but previously remained visible,
so every radio item in a dropdown menu appeared checked.
