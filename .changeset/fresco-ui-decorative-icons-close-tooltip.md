---
'@codaco/fresco-ui': minor
---

A custom icon hidden from screen readers (`aria-hidden`) no longer carries a title, so it shows no tooltip repeating the name of the control it sits in. `CloseButtonTooltipContext`, exported from `@codaco/fresco-ui/CloseButton`, lets a region turn off the close button's tooltip; the button is then named in English for screen readers only. `DataTableFacetedFilter`'s option labels may now be any `PresentationalText`, such as `{ text, dir: 'auto' }` for a name someone wrote.
