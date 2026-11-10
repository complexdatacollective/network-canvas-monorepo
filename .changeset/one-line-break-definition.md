---
'@codaco/shared-consts': minor
'@codaco/fresco-ui': patch
---

`@codaco/shared-consts` now holds the one definition of a line break in text
a participant reads: a line feed, a carriage return, or Unicode's line or
paragraph separator. `holdsLineBreak` finds one, `linesOf` splits text at each
run of them, `asOneLine` joins finished text onto one line (each run with the
whitespace around it becomes one space, and the ends are trimmed), and
`lineBreaksAsSpaces` turns each break in text still being typed into a space,
leaving everything else as it was.

A single-line `RichTextEditorField` now treats Unicode's line and paragraph
separators as line breaks too, so text pasted or stored with one is joined
onto one line with a space, as text with a newline already was.
