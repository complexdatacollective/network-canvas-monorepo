---
'@codaco/fresco-ui': minor
---

Hold a non-dismissible dialog open. `dismissible={false}` hid the dialog's close
button, but pressing Escape or clicking outside still closed it and still called
`closeDialog` — so a dialog that was meant to stay put until its work finished
could be dismissed by either reflex. Both are now refused, which is what the
prop has always said it does. `Modal` takes the same `dismissible` prop, for
overlays that are built on it directly rather than through `Dialog`.
