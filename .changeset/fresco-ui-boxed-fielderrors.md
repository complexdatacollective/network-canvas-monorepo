---
"@codaco/fresco-ui": patch
---

`FieldErrors` accepts a new opt-in `variant` prop (`'text'` | `'box'`,
defaulting to `'text'`). `variant="box"` applies the same boxed destructive
treatment the `interview` theme already renders automatically — a rounded
destructive background with contrast text — regardless of theme, for hosts
that render field errors on a colored background where plain destructive text
would have poor contrast.
