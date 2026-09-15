---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
'@codaco/fresco-ui': patch
'@codaco/tailwind-config': patch
---

Response options read in full in the categorical and ordinal bins. A researcher
can write an option as a whole sentence — "Previously involved in the criminal
legal system, but not currently" is an ordinary thing for a study to ask — and
the bin now sizes that text to the room it actually has, a step at a time, in
place of cutting it off mid-word. Where a bin is too small to hold every word
even at the smallest readable size, the text fades at the edge rather than
stopping without warning, and the whole option is still read out by a screen
reader.

Two ways an option could disappear entirely are fixed. In a tall window, an
ordinal bin's heading could be pushed out through the top and bottom of its own
panel, leaving a coloured band with nothing in it. In a narrow one, the labels
were cut part-way through a line of text.

A bin that holds people shows who is in it underneath the option, as before. It
now steps aside when the option itself needs the room, instead of being cut in
half, and comes back as soon as there is room again.

Emphasis authored in an option — **bold** or _italic_ — now reads as emphasis
against the label's own weight, and a screen reader is handed the words without
the markdown around them.
