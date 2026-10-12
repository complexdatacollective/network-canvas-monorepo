---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Interview analytics now follow their design in three places. `interview_started` is no longer lost when the analytics client arrives after the interview first renders, which happened on every host: stage navigation is recorded from the moment a client is available. `interview_finished` is reported once the host has finished the interview, instead of when the finish screen is reached, so a cancelled or refused finish no longer counts as a completed interview. `form_validation_failed` no longer carries the rendered validation messages, which can contain protocol-authored text; each invalid field is reported by its position and input type only.
