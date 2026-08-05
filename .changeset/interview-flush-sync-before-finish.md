---
'@codaco/interview': patch
---

Answers given in the final moments of an interview are no longer lost when a
participant finishes. Responses are saved on a short delay, so the very last
answer could still be waiting to be written when the interview was marked as
complete — and any study that locks an interview once it is finished then
rejected that late save without warning. The interview now waits for every
outstanding answer to be saved before it is finished. If that final save fails,
the participant can still finish rather than being stranded on the interview.
