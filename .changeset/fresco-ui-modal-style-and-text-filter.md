---
'@codaco/fresco-ui': patch
---

`ModalPopup`'s `style` prop no longer accepts a function, which was never
applied. Only a style object works. `textFilterFn` now matches an object cell
against its JSON text, instead of against `[object Object]`.
