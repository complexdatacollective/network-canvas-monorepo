---
'@codaco/interviewer': patch
---

Fix data export failing with "Permission denied" on desktop Chrome. When the browser reports that file sharing is available but the system share sheet then refuses the file, the export now falls back to a normal file download instead of failing.
