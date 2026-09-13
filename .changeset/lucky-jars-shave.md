---
'@codaco/fresco-ui': patch
'@codaco/art': patch
---

Reopening the everything bar now re-checks its recent items before showing them, instead of briefly painting the rows the previous opening ended with. A recent entry that has since been renamed, or that the researcher no longer has access to, can no longer appear.

A node whose label may no longer be revealed, and a rich text editor's link popover when the field becomes disabled, now update in the same step as the change rather than one frame after it.
