---
'@codaco/interviewer': patch
---

Entering an interview that requires unlocking no longer trusts a value kept in the browser's session storage. Unlocking the app while an interview is open still lets you return to it without a second prompt, but a value placed in session storage can no longer skip the unlock step.
