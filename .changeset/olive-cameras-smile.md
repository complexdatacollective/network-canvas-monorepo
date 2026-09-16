---
'@codaco/architect': patch
'@codaco/fresco-ui': patch
---

Attribute pills in the codebook no longer have an animated border. The moving
border marks the attribute a picker is holding, and the codebook's list of
attributes is a list rather than a choice, so its pills are now drawn in their
type's colour without it.

Rows of a list no longer scale into place when the editor or dialog holding
them opens. The animation is for a row that has just been added, and a row that
was simply there is now drawn at rest from the first frame. Adding, deleting,
reordering and opening a row's editor animate exactly as before.

Asking the attribute window to create an attribute whose kind of answer needs
more than a name now brings the attribute editor to the front. The window that
opened it was being drawn over it, so the editor looked like it had not opened
at all.
