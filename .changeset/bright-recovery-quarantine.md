---
'@codaco/template-registry': patch
---

Add an offline quarantined recovery verification command that checks restored
schema, backup access, artifact integrity, and current operator reconciliation
before credentials can be reauthorized.

Bind recovery to the same live database and keep serving identities, surviving
sessions and prepared transactions quarantined until reconciliation commits.
Verify bounded private reconciliation files before parsing them.
