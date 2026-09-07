---
'@codaco/studio-sync': minor
'@codaco/studio-server': patch
'@codaco/template-registry': patch
---

Provide a shared PostgreSQL catalog privilege guard for migration and backup checks. Refuse capabilities beyond the stock PostgreSQL baseline, including privileged file routines, protected catalog reads and writes, grant options, reserved namespace creation or ownership, and system SECURITY DEFINER routines.

Apply the guard to every restricted migration identity and the actual backup role and LOGIN. Refuse database TEMPORARY privileges before temporary namespaces exist. Pin pool-based backup checks to one bounded read-only transaction while preserving explicitly supplied client transactions and fixed failure diagnostics.

Expose a runtime admission guard that verifies the actual PostgreSQL session login, its exact SET-only runtime memberships, direct CONNECT enrollment, and lack of owner, administration, direct-data, large-object, parameter, or expanded catalog capabilities.
