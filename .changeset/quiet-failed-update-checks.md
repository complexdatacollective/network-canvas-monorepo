---
'@codaco/architect': patch
'@codaco/interviewer': patch
---

A failed background check for a new version no longer counts as a crash.
Architect and Interviewer look for an update once an hour, and that check
simply cannot succeed while you are offline or your connection drops — an
everyday situation for an app built to keep working without one. Until now the
failure escaped as an unhandled error, which put a spurious crash in the error
report and told us nothing. The check now fails quietly and tries again at the
next hour, exactly as it always did from your side.
