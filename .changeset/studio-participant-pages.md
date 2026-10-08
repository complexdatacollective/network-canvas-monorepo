---
'@codaco/studio-web': minor
'@codaco/studio-api': patch
'@codaco/studio-contract': patch
---

Participants can now take an interview in Studio. Opening an interview link
starts or resumes the participant's session and runs the interview; answers
and the stage reached are saved as the participant goes, with a last save sent
as the page is closed. Reopening a participant's own link in the same browser
returns to their session, and reloading the page keeps it. An anonymous link
resumes only in the tab it was opened in, so the next person on a shared
device starts their own interview. Finishing shows a notice that the interview
is complete, and the same notice greets a participant who reopens a finished
interview. A link that cannot be used says why: it was not recognised, has
expired or been withdrawn, the study is not open, paused or closed, or the
interview is open in another window; an interview whose link was opened again
elsewhere asks the participant to open their link to continue. Participant
pages send no cookies with their requests and never ask who is signed in.
