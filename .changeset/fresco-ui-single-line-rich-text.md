---
'@codaco/fresco-ui': minor
---

Add `singleLine` to `RichTextEditorField`, which holds the editor to one line.

A field that stores a single line of text — a label, a short prompt — had no way to say so to the editor, only to whatever converted the document afterwards. The editor was therefore free to hold a second paragraph, and the converter had to invent a join for a shape it was never meant to see: Architect's markdown adapter joined two paragraphs with a space, so a label whose first paragraph had just been emptied saved "Never met" as " Never met".

With `singleLine`, the document is a single paragraph in the schema, Enter and Shift-Enter do nothing, a pasted passage arrives with its lines joined by spaces and its formatting intact, and the box reports `aria-multiline="false"`. The heading, list and rule controls are withheld along with it, because a block cannot exist in that document and the buttons would do nothing.
