---
'@codaco/fresco-ui': minor
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Rounded corners now always come from the theme's radius tokens, including on elements that animate their size. The segmented toolbar is a full pill at every screen size, so its ends match its round buttons on large screens too, and its corners stay round while tools appear and disappear. Lists of items in forms, the expanded category in the categorical bin interface, and dialogs that open out of a list row keep the theme's corner radius throughout their animations.

`@codaco/fresco-ui` adds `useTokenRadius` (`@codaco/fresco-ui/hooks/useTokenRadius`), which reads the radius an element's `rounded-*` class resolves to so it can be passed to a Motion component's `style.borderRadius`. `ModalPopup` applies it itself for a `layoutId` morph.
