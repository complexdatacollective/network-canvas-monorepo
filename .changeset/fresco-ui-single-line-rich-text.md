---
'@codaco/fresco-ui': minor
---

Add `singleLine` to `RichTextEditorField`, which holds the editor to one line.

A field that stores a single line of text — a label, a short prompt — had no way to say so to the editor, only to whatever converted the document afterwards. The editor was therefore free to hold a second paragraph, and the converter had to invent a join for a shape it was never meant to see: Architect's markdown adapter joined two paragraphs with a space, so a label whose first paragraph had just been emptied saved "Never met" as " Never met".

With `singleLine`, the document is a single paragraph in the schema, Enter and Shift-Enter do nothing, a pasted passage arrives with its lines joined by spaces and its formatting intact, and the box reports `aria-multiline="false"`. The heading, list and rule controls are withheld along with it, because a block cannot exist in that document and the buttons would do nothing.

A document handed to the field as its `value` is joined the same way, and joined before anything reads it. The schema is not consulted on that route — a value is read with `Node.fromJSON`, which builds what it is told to build — so a stored two-paragraph document would otherwise arrive whole and the field would show two lines while promising one. A hard break inside a paragraph is joined too; it sits inside the paragraph rather than beside it, so the schema was never going to refuse it at all. A value holding a heading, a list or a rule fared worse still: reading it fails outright on a node type the single-line schema does not have, and TipTap answers that with an empty document, so the text did not arrive flattened, it arrived as nothing and the next edit saved that over it. A MARK the schema does not have — a link, in a field whose toolbar offers none — fails the same read the same way, so the flattening drops the marks this field has no type for and keeps the words they were on.
