---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Leaving or finishing an interview now waits until the latest answers have been
saved. If saving them fails (for example, because the connection dropped), the
interview stays open and the confirmation explains that the answers could not
be saved, so the participant can try again. Previously the interview closed or
finished anyway, and the answers given since the last save could be lost.
