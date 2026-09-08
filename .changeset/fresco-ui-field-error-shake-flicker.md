---
'@codaco/fresco-ui': patch
---

Fix `FieldErrors`' shake animation replaying on every keystroke of an already-invalid field. Revalidating a dirty field clears its error and writes the identical message back within the same keystroke, which made the message flicker off and back on and, with it, the shake — even though nothing had actually changed. The shake now only replays when the message itself changes.
