---
'@codaco/interviewer': patch
---

Close data-loss and setup gaps surfaced by the pre-release audit follow-up:

- **Export marking:** on browsers that can't report whether a file download completed (the object-URL fallback), the app now confirms the archive was saved before marking sessions as exported — a cancelled or blocked Save-As can no longer falsely mark a session "exported" (which fed the filter-to-exported → bulk-delete data-loss path).
- **Setup wizard:** a failed same-method re-enrolment (e.g. cancelling the biometric prompt after the old vault was revoked) can no longer finish the wizard claiming a lock mode the vault doesn't actually hold.
- **Lock screen:** a destructive "reset app data" confirmation opened while locked is now dismissed when the app unlocks, so it can't survive the lock boundary and fire over Home.
