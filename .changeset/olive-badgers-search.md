---
'@codaco/fresco-ui': minor
---

`ArrayField` tells each row the word the list uses for its rows, and a
confirmed removal leaves focus inside the list.

`ArrayFieldItemProps` gains `itemLabel`, the descriptor the list already
declares for its delete confirmation, so a row can name its own Edit and
Remove controls for the researcher instead of leaving several lists on one
screen showing identically named buttons.

It also gains `deleteTriggerRef`. A row that registers the control opening its
removal lets the list's own `confirmDelete` hand focus to the row that takes
the removed one's place — and to the add button only when the list is emptied
— rather than sending the researcher out of the middle of a list they were
working down.
