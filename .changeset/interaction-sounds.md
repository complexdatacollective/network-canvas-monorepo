---
'@codaco/interview': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Interviews can now play short sounds: when the participant adds, removes, connects, highlights or sorts nodes, while a node on a sociogram waits to be connected, when they press Back or Next, when a form cannot be submitted because it has errors, and when the interview ends. Sounds are off by default. Turn them on in Interviewer under Settings → Interview, and in Fresco under Settings → Interview Settings. The sound file is downloaded only once sounds are on, and Interviewer stores it with the app so sounds also work offline. No sound plays until the participant first taps, clicks or presses a key, because browsers do not allow it.

For developers: the interview `Shell` has an `interactionSounds` prop (default `false`). `@codaco/fresco-ui` adds `InvalidSubmitListener` (`@codaco/fresco-ui/form/InvalidSubmitListener`), which is told each time a form inside it refuses a submission.
