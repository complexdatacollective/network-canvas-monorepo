---
'@codaco/fresco-ui': patch
---

Screen readers now announce a name for more of the form controls. The search popup that opens from a multi-select dropdown is announced by the same name as the field itself, a month-and-year date field announces which box is the year and which is the month even when it has no id, and a name given to it directly is kept. The relative date field now uses a name given to it directly instead of ignoring it.
