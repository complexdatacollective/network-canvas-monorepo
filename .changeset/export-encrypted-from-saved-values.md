---
'@codaco/network-exporters': patch
'@codaco/interviewer': patch
'fresco': patch
---

CSV and GraphML exports now mark an answer `ENCRYPTED` only when it was
saved encrypted. Before, the exporters followed the protocol's current
setting, so an answer saved as plain text could be exported as `ENCRYPTED`.
An answer saved encrypted could also be exported as unreadable data, if the
protocol no longer asked for encryption. GraphML node labels follow the same
rule. A plain-text answer that replaced an encrypted one is exported as
itself, even where an earlier version left the encrypted answer's details
saved alongside it.
