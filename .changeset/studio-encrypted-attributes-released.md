---
'@codaco/studio-sync': major
'@codaco/studio-api': minor
'@codaco/studio-web': minor
---

Encrypted attributes are no longer experimental. Protocols keep their
`experiments` setting, for features released within a schema version, and
the protocol settings section still accepts and keeps it, but
`encryptedVariables` is no longer one of its experiments: the settings
section refuses it, and an attribute marked as encrypted is always
encrypted. A stored schema 8 protocol is upgraded with its
experiments included, so attributes it encrypted stay encrypted, and
attributes it marked as encrypted without turning the experiment on are
unmarked and keep being collected without encryption.

In the protocol editor, an Anonymisation stage's passphrase lengths now show
the minimum that applies: 8 unless the stage sets its own, or the stage's
maximum when that is shorter.

Skip logic, stage filters and panel filters are checked without the
participant's passphrase, so they can't compare the answers to an encrypted
attribute, but they can still check whether it is answered. When you build
one of these rules, the protocol editor offers an encrypted attribute only
with "exists" and "does not exist", except in a panel that lists people from
an external data file, whose rows are not encrypted. A stored rule that
compares one is marked, and can't be saved until it is changed. The editor
won't let you encrypt an attribute while one of these rules compares its
answers.
