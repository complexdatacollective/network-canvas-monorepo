---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Fixed a problem that could make the interview skip a stage. Some stages move on by themselves shortly after the last question is answered: the dyad census, the tie strength census, and the per-person and per-connection forms. If the participant answered the last question on one of these stages and pressed Next quickly, the interview could move past the following stage as well, so the participant never saw it. The following stage is now always shown.
