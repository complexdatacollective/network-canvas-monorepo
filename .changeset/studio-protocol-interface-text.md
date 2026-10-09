---
'@codaco/studio-api': patch
'@codaco/studio-sync': patch
---

A protocol keeps the interview's shared words (its `interfaceText`) when
Studio stores and edits it: a new protocol starts with them, and the protocol
settings section carries them through every save. A protocol Studio assembles
holds the words for what it shows now, so adding a form or a passphrase gives
it their words, removing one drops them, and words the researcher changed are
kept.
