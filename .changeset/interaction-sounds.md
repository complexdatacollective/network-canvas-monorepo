---
'@codaco/interview': minor
'@codaco/fresco-ui': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Interviews can now play short sounds: when the participant adds, removes, connects, highlights or sorts nodes, when they pick up a node to drag it, when they drop a node in a place that accepts it (the sound depends on where the node is dropped: on the trash, in a bin, on a sociogram or other node canvas, in the prompt's list, or back in a side panel), when they choose an answer in a form, while a node on a sociogram waits to be connected, when Back or Next moves the interview to another screen, when a form cannot be submitted because it has errors, and when the interview ends. Sounds are off by default. Turn them on in Interviewer under Settings → Interview, and in Fresco under Settings → Interview Settings. The sound files are downloaded only once sounds are on, and Interviewer stores them with the app so sounds also work offline. No sound plays until the participant first taps, clicks or presses a key, because browsers do not allow it.

For developers: the interview `Shell` has an `interactionSounds` prop (default `false`). `@codaco/fresco-ui` adds `FormFeedbackListener` (`@codaco/fresco-ui/form/FormFeedbackListener`), which is told each time a form inside it refuses a submission and each time the participant chooses or clears an option in one of its fields. It also adds `DragFeedbackListener` (`@codaco/fresco-ui/dnd/DragFeedbackListener`), which is told when a drag starts and wraps each accepted drop, and a `dropFeedback` option on `useDropTarget` and `useDragAndDrop`, with which a drop target declares the feedback for a drop on it, either as a name or as a function (`DropFeedback`) that chooses it from the dropped item. A drop handler may now return `false`, or a promise of `false`, to say it refused the drop (`DropOutcome`), and the drop's feedback is then not given.
