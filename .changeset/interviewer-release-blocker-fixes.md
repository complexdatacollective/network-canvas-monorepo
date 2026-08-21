---
'@codaco/interviewer': patch
---

Interviewer now handles protocol files, interview resources, validation failures, and hosted dialogs more reliably.

- Damaged or unsupported protocol imports and storage failures provide actionable messages instead of archive, database, or stack-trace details.
- Images, videos, and rosters are shared while in use and released after a protocol is replaced or deleted, preventing stale or decrypted resources from remaining in memory.
- Required questions and invalid forms focus the first control needing attention, while interview confirmations restore focus to the control that opened them.
- Family Pedigree references are validated before fieldwork, and application telemetry consistently reports the product version without participant-facing error detail.
