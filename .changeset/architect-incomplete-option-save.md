---
'@codaco/architect': patch
---

Fix being able to save an option that has no label or no value. Confirming an
option you had not filled in used to collapse it into the list with nothing to
show it was incomplete, leaving a protocol that failed validation later. The
option's editor now stays open and marks whichever field is still missing, and
an options list containing an incomplete option says so.
