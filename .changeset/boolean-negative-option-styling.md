---
'@codaco/fresco-ui': patch
---

`BooleanField` now honours the `negative` flag on a boolean option. Selecting an option marked negative styles its border and indicator in the destructive colour instead of the primary one; unselected options are unchanged. Previously the flag was accepted by the protocol schema and written by Architect, but ignored at render time.
