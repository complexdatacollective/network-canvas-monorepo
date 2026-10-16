---
'fresco': patch
---

When Fresco cannot upgrade a protocol made with an older version of Network Canvas, it now reports the import both as a refused protocol and as an application error, so failed upgrades can be counted and fixed. Damaged files are still reported only as refused protocols, without the file's contents.
