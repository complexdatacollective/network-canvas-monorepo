---
'@codaco/shared-consts': major
---

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
