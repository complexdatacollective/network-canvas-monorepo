---
'@codaco/architect': patch
---

Three fixes to the stage timeline, Undo, and deleting a protocol.

The list of stages now reaches VoiceOver as a list. It already did in Chrome,
so the fix that made the timeline report the right number of stages was only
working on one of the two browsers Architect supports — on Safari there was no
list, no count, and no way to step between stages as list items.

Undo now survives another tab opening and closing the same protocol. Deleting
a stage says it can be restored with Undo while the protocol stays open, and
that was untrue in one situation: if a second tab opened the protocol and
closed again, this tab quietly re-read the saved copy and threw the whole undo
history away, with nothing on screen to say so. The history is kept when the
saved copy is unchanged. If the other tab really did edit, history is still
cleared — undoing then would silently overwrite the other tab's work.

Deleting a protocol no longer leaves a copy of it in memory. The delete says
it is permanently removed from this device; in fact a full copy — every label,
prompt and codebook entry, including anything written during piloting —
stayed in the undo history until another protocol was opened or the page was
reloaded.
