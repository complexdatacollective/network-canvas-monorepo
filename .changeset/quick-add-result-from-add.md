---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

The field for adding a name on a name generator now clears a name only once
the person has been added, and keeps a name that could not be added, with a
message above it saying why. Before, the field worked out whether a name had
been added from the order in which its updates arrived, so a name that was not
added could be cleared and lost, and a name that was added could stay in the
field.

On a roster whose names are protected with a passphrase, a person now leaves
the roster as soon as they are dropped, rather than once their name has been
protected. Before, they stayed on the roster for that moment and could be
dropped again. If they cannot be added, they go back on the roster and a
message says why.
