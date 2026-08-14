---
'@codaco/architect': patch
---

Edits made inside a stage are now held until you save the stage, so leaving it without saving really does leave your protocol untouched.

Previously, changes made in a field or variable editor were written to the Codebook the moment that editor was saved — before the stage itself was. Because a variable is shared by every stage that collects it, this could quietly change other parts of a protocol:

- Discarding a stage kept the changes anyway. A renamed variable, a swapped input control, edited answer options, changed labels or parameters, and altered validation rules all survived "Leave Without Saving", and the change reached every other stage collecting that variable.
- Making a variable required in one stage made it required everywhere, even if the stage that did it was then thrown away.
- Adding a form field that created a new variable, then removing the field and leaving without saving, left the new variable behind in the Codebook, used by nothing.
- Renaming a variable from the field editor left the stage looking unedited, so leaving the stage never even asked about unsaved changes.

A stage editor now works on its own copy of the Codebook. Everything you change inside it — including from nested field and variable editors — is applied only when you choose "Finished Editing", and is applied together with the stage in a single step. Cancelling, leaving without saving, or navigating away restores the Codebook exactly as it was, and undo inside the editor now steps back through variable changes alongside the rest of the stage.

Anything genuinely unrelated to the stage, such as a resource imported from the editor, is unaffected by discarding it.
