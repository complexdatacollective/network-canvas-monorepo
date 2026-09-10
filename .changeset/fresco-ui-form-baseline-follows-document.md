---
'@codaco/fresco-ui': patch
---

A form can be told the document it edits has been stored, and every field's
baseline moves onto it. `<Form initialValues={…}>` gave a field its starting
value when the field mounted and never moved it again, so a form whose stage
had just been saved went on measuring every field on screen against the
reading it opened on and reported itself dirty over work that was stored — and
a host guarding unsaved work asked whether to discard changes the person had
just watched it save. The form store now offers `rebaseToDocument(document)`: a
field holding what that document says stops counting as unsaved work, while an
edit the document does not have keeps its value and goes on saying it is
unsaved. Deliberately said by the host rather than inferred from
`initialValues` moving — a working document also advances for writes nobody has
saved, and a baseline taking those would call a form clean with all of it still
to save.
