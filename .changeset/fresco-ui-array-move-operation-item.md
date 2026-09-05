---
'@codaco/fresco-ui': patch
---

`ArrayField`'s `move` operation now carries the row that moved, alongside the two positions it already reported. A pointer drag reads `from` when the pointer goes down and `to` when it comes up, and `ArrayField` re-syncs its rows from the `value` prop in between — so a value that changes mid-drag leaves the two ends numbered against two different lists, and an `onOperation` consumer replaying `from` reorders whichever row has since taken that place. The row itself is the only part of the operation that survives the change, so it is now what a consumer should resolve the move by.
