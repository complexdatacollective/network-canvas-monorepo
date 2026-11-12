---
'@codaco/studio-api': patch
'@codaco/studio-web': patch
---

The protocol editor's file messages are now in the reader's language. When
Studio cannot store, find or accept a file (an image, audio, video or roster),
it used to show the server's English, such as "this host holds no bytes for
that resource". It now says what happened in words that can be translated, and
uses the same words the editor's own checks use for a roster it cannot read.
