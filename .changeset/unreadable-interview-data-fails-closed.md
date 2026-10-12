---
'fresco': patch
'@codaco/interviewer': patch
---

An interview whose saved answers cannot be read is no longer at risk of being
overwritten. Fresco used to open such an interview as if nothing had been
answered yet, and its first save then replaced everything stored, including
the participant's answers. Fresco now shows the participant an error instead of
starting the interview, refuses any save over data it cannot read, and records
the failure in error tracking. The interview data API returns an error for
such an interview rather than an empty network, and an export that includes one
stops instead of writing an empty network into the file. Interviewer, which
already left such an interview untouched, now shows an error instead of loading
indefinitely, and records the failure too.
