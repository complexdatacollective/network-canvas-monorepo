---
'@codaco/fresco-ui': patch
---

Forward the redux-form field name onto the field wrapper as a `data-field-name` attribute (for reliable end-to-end targeting). The name continues to be passed to the inner field component, so no existing behaviour changes.
