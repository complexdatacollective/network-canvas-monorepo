---
'@codaco/architect': patch
'@codaco/fresco-ui': minor
---

Text fields that hold a single line, such as a prompt, now start one line tall and grow as the text wraps, instead of opening as a tall box that suggests you can write paragraphs. In fresco-ui, `RichTextEditorField`'s `singleLine` now sets this height as well as limiting the value to one paragraph.
