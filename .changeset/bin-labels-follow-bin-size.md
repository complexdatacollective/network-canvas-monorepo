---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Category and ordinal bin labels now resize when their bin does. Before, a bin that changed size while the window stayed the same kept its label at the old size, which could cut off the end of the text.
