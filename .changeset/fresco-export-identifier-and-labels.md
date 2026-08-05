---
'fresco': patch
---

Exported interview data now identifies each case by the participant's
identifier rather than their label. A label is optional and need not be unique,
so any study using labels was exporting cases under a name that could repeat
between participants and did not match the identifier used by recruitment links
and the participants table.

Clearing a participant's label now removes it. The edit appeared to succeed
while the old label was silently kept.

Editing a participant's identifier now refreshes the interviews table, which
previously kept showing the old identifier until something else changed.
