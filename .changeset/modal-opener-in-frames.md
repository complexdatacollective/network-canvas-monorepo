---
'@codaco/fresco-ui': patch
---

A modal rendered into an iframe or a popped-out window now returns focus to the control that opened it when it closes. It used to read the opener from the surrounding page, where the focused element is the frame itself, so focus went back to the `<iframe>` and the modal's own document was left with nothing focused.
