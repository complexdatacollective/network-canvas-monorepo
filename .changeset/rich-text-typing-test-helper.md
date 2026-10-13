---
'@codaco/fresco-ui': minor
---

Adds `@codaco/fresco-ui/testing/withSafeTypingIntoRichText`, a wrapper for a user-event `user` that makes `user.type` reliable against `RichTextEditorField` under jsdom. Without a layout to hit-test, user-event puts a click into an empty editor after its paragraph instead of inside it. ProseMirror moves the caret back only once jsdom reports the selection change, so a first key typed before that report was dropped, and tests failed now and then with their first character missing. The wrapped `type` clicks, waits for that report, checks that the caret is inside a paragraph, and then types.
