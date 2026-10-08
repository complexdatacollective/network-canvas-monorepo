---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A change made in the Network Composer's side panel is no longer lost when the
panel closes. Leaving the stage, moving to another person or relationship,
tapping the background, closing the side panel or choosing another tool first
saves a change that has not been saved yet. If the change cannot be saved,
for example because an answer is not valid or the passphrase cannot protect
it, the participant is asked before it is discarded and can keep it to go on
editing. Before, a change made just before the panel closed, or one that
could not be saved, was lost without a word. Deleting the person or
relationship removes their unsaved changes with them, without asking.

Undoing or redoing a change while the side panel is open now shows the
restored answers in the panel. Before, the panel went on showing the answers
as they were before the undo, and changing any answer in it saved them again.
