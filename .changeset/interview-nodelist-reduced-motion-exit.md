---
'@codaco/interview': patch
---

Node lists now respect reduced-motion preferences when moving between prompts. Previously the outgoing nodes always played a fade-out animation before the next prompt's nodes appeared, even when the participant's system requested reduced motion; the swap is now instant in that case.
