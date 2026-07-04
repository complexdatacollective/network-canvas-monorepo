---
'@codaco/fresco-ui': patch
---

Add `closeAllDialogs()` to the `DialogProvider` context. It dismisses every open dialog at once, resolving each pending promise with `null` (the cancel value) — for dismissing dialogs on a global state change such as an auth lock, so a destructive confirm can't survive it.
