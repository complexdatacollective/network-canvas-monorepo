---
'@codaco/interviewer': patch
---

Closed a gap where locking the vault while the stored-protocol migration check was still running could let the app admit its routes on the next unlock before that check had run again.

The lock screen's recovery restriction, and the counts and warnings in the data, settings and status screens, now appear in the same step as the change that causes them rather than one frame later.
