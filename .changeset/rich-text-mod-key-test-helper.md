---
'@codaco/fresco-ui': minor
---

Adds `@codaco/fresco-ui/testing/modKey`, whose `withMod(keys)` wraps a user-event keyboard sequence in the platform's `Mod` key: Cmd on macOS and iOS, Control elsewhere. `RichTextEditorField`'s undo and redo come from ProseMirror, which reads `Mod` that way, so a test that sends `{Control>}z{/Control}` undoes on Linux but does nothing in a browser on a Mac. `withMod('z')` and `withMod('{Shift>}z{/Shift}')` undo and redo on both.
