---
'@codaco/interviewer': patch
---

When generating synthetic sessions fails, the reason is now readable. A
protocol whose validation rules cannot all be satisfied lists each clash on its
own line, naming the variables involved and what conflicts, instead of running
the whole explanation together into a single unbroken line.

Any generation failure now stays on screen until you dismiss it, rather than
timing out while you are still reading it.

A failed generation also no longer leaves part of a batch behind. Most protocols
whose rules cannot be satisfied are refused before anything is saved, but a
protocol can pass that check and still run out of usable values part-way through
a batch. The sessions saved before that point are now removed, so the number of
synthetic sessions shown always matches what is actually stored, and generating
again cannot quietly leave you with a half-finished duplicate set.
