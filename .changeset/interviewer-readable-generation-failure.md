---
'@codaco/interviewer': patch
---

When generating synthetic sessions fails, the reason is now readable. A
protocol whose validation rules cannot all be satisfied lists each clash on its
own line, naming the variables involved and what conflicts, instead of running
the whole explanation together into a single unbroken line.

Any generation failure now stays on screen until you dismiss it, rather than
timing out while you are still reading it.
