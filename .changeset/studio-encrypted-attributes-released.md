---
'@codaco/studio-sync': major
'@codaco/studio-api': minor
'@codaco/studio-web': minor
---

Encrypted attributes are no longer experimental, so protocols no longer have
an `experiments` setting. The protocol settings section no longer accepts
`experiments`, and the server no longer splits a protocol's experiments into
its settings section. A stored schema 8 protocol is upgraded with its
experiments included, so attributes it encrypted stay encrypted, and
attributes it marked as encrypted without turning the experiment on are
unmarked and keep being collected without encryption.

In the protocol editor, an Anonymisation stage's passphrase lengths now show
the minimum that applies: 8 unless the stage sets its own, or the stage's
maximum when that is shorter.

The protocol editor no longer offers encrypted attributes when you build skip
logic, a stage filter or a panel filter, except in a panel that lists people
from an external data file, because these rules are checked without the
participant's passphrase. It won't let you encrypt an attribute that one of
these rules uses until the rule is removed or changed.
