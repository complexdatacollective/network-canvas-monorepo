---
'@codaco/interview': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Interviews can now play short sounds: when the participant adds, removes, connects, highlights or sorts nodes, when they place or move a node on a sociogram, when they choose an answer in a form, while a node on a sociogram waits to be connected, when Back or Next moves the interview to another screen, when a form cannot be submitted because it has errors, and when the interview ends. Sounds are off by default. Turn them on in Interviewer under Settings → Interview, and in Fresco under Settings → Interview Settings. The sound files are downloaded only once sounds are on, and Interviewer stores them with the app so sounds also work offline. No sound plays until the participant first taps, clicks or presses a key, because browsers do not allow it.

For developers: the interview `Shell` has an `interactionSounds` prop (default `false`). `@codaco/fresco-ui` adds `FormFeedbackListener` (`@codaco/fresco-ui/form/FormFeedbackListener`), which is told each time a form inside it refuses a submission and each time the participant chooses or clears an option in one of its fields.
