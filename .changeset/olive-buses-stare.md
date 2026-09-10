---
'@codaco/architect': patch
---

Asset previews, the codebook variable list, the timeline and the issues panel now update in the same step as the change that caused them, rather than one frame later.

Switching a stage's roster or network asset while its variables are still being read no longer leaves the attribute options stuck on an empty list, and a slow read that finishes after you have already moved on can no longer overwrite the current asset's answer.
