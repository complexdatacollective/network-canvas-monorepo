---
'@codaco/architect': patch
---

Changes you make to the codebook while editing a stage are now part of that
stage's edit. This includes an attribute's validation rules (for example under
"Quick add configuration"), new attributes and types, answer options, input
controls, renamed attributes, encrypted attributes and family pedigree symbols. The same
goes for wording shared by every stage of a kind, under "Customize built-in
wording". "Finished Editing" now appears after such a change, and the changes are saved
when you save the stage. Cancelling the stage undoes them. Cancelling a dialog
inside the stage editor, such as a form field, undoes the codebook changes made
in that dialog. Previously these changes were saved immediately and stayed even
after you cancelled the stage.
If somebody else changed the same type in a way that clashes with yours, for
example by adding an attribute with the same name, saving the stage explains
the clash and keeps your changes so you can fix them.
