---
'@codaco/studio-server': patch
---

Keep application and background database connections on their intended roles when database URLs include startup options. Preserve connection settings and refuse a client whose actual role does not match before any application query runs.
