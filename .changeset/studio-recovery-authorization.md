---
'@codaco/studio-server': patch
---

Add a quarantine-only recovery command that reconciles restored authorization against independently pinned current evidence, invalidates restored credentials and sessions, and holds ambiguous outbound delivery before any later admission decision.
