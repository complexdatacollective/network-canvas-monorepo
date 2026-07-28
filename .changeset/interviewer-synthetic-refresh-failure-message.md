---
'@codaco/interviewer': patch
---

Generating or deleting synthetic sessions could sometimes leave the Synthetic
data screen showing a stale protocol list and session count if the screen
couldn't refresh right after the action finished. Generating gave no
indication anything was wrong; deleting was worse — it could show a
"Deleted" success message while also reopening the delete confirmation with an
unrelated error, even though the sessions had already been removed. Both cases
now tell you clearly when the refresh itself is what failed, so you know to
reopen Settings rather than trust an out-of-date count.
