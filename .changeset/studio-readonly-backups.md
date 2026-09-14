---
'@codaco/studio-server': minor
'@codaco/studio-sync': minor
---

Support complete database backups through separately held read-only credentials. A dedicated backup role can read every tenant and migration record without superuser or row-security bypass privileges. The explicit backup verification command refuses incomplete row policies, unsafe role grants, writable objects and mismatched schemas before an operator captures a backup.
