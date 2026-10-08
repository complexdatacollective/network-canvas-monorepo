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
An answer the participant had changed but not yet saved when the undo or redo
changed it stays as they typed it, and is not saved over what the undo or redo
restored. It is saved once they change that answer again, and closing the
panel asks before discarding it.

One undo now reverts every answer in a run of side-panel edits to the same
person or relationship. Before, it put back only the answers the first edit
of the run changed, so an answer first given in a later edit stayed. An undo
or redo pressed while a change is still being saved now applies after that
change, instead of before it.
