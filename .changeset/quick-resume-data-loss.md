---
'@codaco/interview': patch
'@codaco/interviewer': patch
---

Fixed a race that could permanently lose answers added just before exiting an
interview. Autosaves are debounced, so an answer given moments before exiting
could still be waiting to save when the interview closed; resuming promptly
then loaded the session without it, and the next screen change saved that
stale copy back over the stored interview. The interview runtime now writes
any pending autosave as the interview closes, and Interviewer waits for
in-flight session writes before loading a session, so a fast exit-and-resume
always shows — and keeps — every answer.
