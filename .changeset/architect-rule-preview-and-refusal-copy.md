---
'@codaco/architect': patch
---

Download and Save to source can no longer be started twice by one intent, even
if the button is activated again before it has had a chance to show that it is
busy. Save to source overwrites protocol source files, so running it twice at
once could have lost work.
