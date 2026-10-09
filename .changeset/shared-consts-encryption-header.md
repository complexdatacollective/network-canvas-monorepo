---
'@codaco/shared-consts': major
---

`NcNetwork` can now carry an `encryption` header (`NcEncryptionHeader`), which
describes how an interview's encryption key is made from the participant's
passphrase and holds the check value that tells the right passphrase from a
wrong one. `NcNetworkSchema` keeps the header when it parses a network, so a
host that validates sessions no longer drops it.

The metadata stored beside an encrypted value is now `{ iv }`. `salt` is
optional, and present only on values written by the experimental schema 8
feature, which can no longer be decrypted; networks holding them still parse
unchanged. Code that read `salt` from this metadata must now allow for it to
be missing.

`DEFAULT_PASSPHRASE_MIN_LENGTH` (8) is the shortest passphrase an interview
accepts when its Anonymisation stage sets no minimum of its own.
`effectivePassphraseMinLength(rules)` gives the minimum that applies to a
stage's length rules: the stage's own minimum when it sets one, otherwise the
default, lowered to the stage's maximum when that is shorter.
