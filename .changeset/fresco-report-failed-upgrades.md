---
'fresco': patch
---

When Fresco cannot upgrade a protocol made with an older version of Network Canvas, it now reports it to analytics both as a refused protocol and as an application error, so failed upgrades can be counted and fixed. This covers protocols being imported and protocols already stored when a new version of Fresco starts. Damaged files are still reported only as refused protocols. Nothing is reported when analytics are disabled, and no protocol names or contents are sent.
