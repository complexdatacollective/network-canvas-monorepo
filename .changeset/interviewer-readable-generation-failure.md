---
'@codaco/interviewer': patch
---

When generating synthetic sessions fails, the reason is now readable. A
protocol whose validation rules cannot all be satisfied lists each clash on its
own line, naming the variables involved and what conflicts, instead of running
the whole explanation together into a single unbroken line.

Any generation failure now stays on screen until you dismiss it, rather than
timing out while you are still reading it. A protocol with many clashing rules
no longer grows the message taller than the screen, which used to carry its own
heading and close button out of view: the list of clashes now scrolls within the
message, and can be scrolled from the keyboard as well as the mouse.

A failed generation also no longer leaves part of a batch behind. Most protocols
whose rules cannot be satisfied are refused before anything is saved, but a
protocol can pass that check and still run out of usable values part-way through
a batch, or fail to save one. Every session written during a failed batch is now
removed — including the one being written when the failure struck — so the number
of synthetic sessions shown always matches what is actually stored, and
generating again cannot quietly leave you with a half-finished duplicate set.
