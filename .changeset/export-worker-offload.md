---
'@codaco/interviewer': patch
---

Export archives are now built in a background worker, so the export dialog's
progress animations stay smooth during large exports. Interview data is still
read and decrypted only in the app itself; cancelling an export now also
releases all partially built archive data immediately.
