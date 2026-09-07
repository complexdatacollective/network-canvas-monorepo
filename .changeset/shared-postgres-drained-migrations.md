---
'@codaco/studio-sync': patch
'@codaco/studio-server': patch
---

Refuse runtime sequence reset privileges and require runtime and backup sessions to drain before pending migrations. Refresh connection evidence before commit, preserving security verification with live services when no schema change is pending.
