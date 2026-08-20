---
'@codaco/architect': patch
---

Deleting a protocol no longer leaves a copy of it in memory.

The delete says it is permanently removed from this device; in fact a full
copy — every label, prompt and codebook entry, including anything written
during piloting — stayed in the undo history until another protocol was
opened or the page was reloaded.
