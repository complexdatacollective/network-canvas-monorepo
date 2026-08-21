---
'@codaco/interviewer': patch
---

Interviewer normalizes older stored sessions at its read boundaries, so interviews containing nullish entity attributes continue to hydrate, synchronize, and export under the new sparse-attribute contract.
