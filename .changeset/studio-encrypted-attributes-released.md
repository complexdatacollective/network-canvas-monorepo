---
'@codaco/studio-sync': major
'@codaco/studio-api': minor
---

Encrypted attributes are no longer experimental, so protocols no longer have
an `experiments` setting. The protocol settings section no longer accepts
`experiments`, and the server no longer splits a protocol's experiments into
its settings section. A stored schema 8 protocol is upgraded with its
experiments included, so attributes it encrypted stay encrypted, and
attributes it marked as encrypted without turning the experiment on are
unmarked and keep being collected without encryption.
