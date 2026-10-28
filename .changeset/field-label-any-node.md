---
'@codaco/fresco-ui': patch
---

A `Field`'s `label` and `hint` accept any React node whatever its control. The field shows them itself and never passes them to the control, so a control's own `label` prop (such as `BooleanField`'s) no longer narrows what the field accepts.
