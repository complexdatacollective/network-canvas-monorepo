---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

Changing an information item's content type no longer destroys what you wrote, and can no longer put an internal resource id in front of a participant.

Information stages — and family pedigree intro screens, which share the same editor — let you set each block to text, image, audio or video. Changing that setting used to hand the old type's value to the new control. Turning an image block into a text block filled the text editor with the image's internal identifier, and saving published that identifier as the words a participant reads. Turning a text block into an image and back destroyed the text, including anything typed in that session, with no warning and no way to bring it back short of abandoning the whole stage.

Each content type now keeps its own draft while the window is open. Switching type sets the content you had entered aside and brings it back if you return to that type, so nothing is discarded while you are still deciding, and no identifier can reach the text editor at all. Only the type you save is written to the protocol. Each change is announced to screen readers, saying whether earlier content has been restored, is being kept for the type it belongs to, or was never entered.

A block whose resource cannot be shown now says why and asks you to choose a content type, rather than opening the text editor on the reference itself. It distinguishes a resource that is no longer in the protocol from one that is still there but is not an image, audio or video file, so you are never sent looking for a deletion that never happened.

Saving a block with no content is now refused visibly. It used to be refused silently: nothing changed, nothing was said, focus went nowhere, and pressing Save a second time was what committed the identifier as text.

Fresco UI: a rich text field no longer reports a change when it is merely disabled or re-enabled, which every form does to every field while it submits. That report overwrote whatever the surrounding form had most recently put into the field, so a field cleared or replaced from outside the editor could silently revert on the next submit. Separately, a value change arriving from outside the editor could be dropped altogether, leaving the editor showing text the form no longer held. A rich text field that blocks a submission now also takes focus itself, so the reason the form refused is announced, instead of focus landing on the editor's Bold button or nowhere at all.
