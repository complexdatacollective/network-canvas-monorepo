---
'@codaco/fresco-ui': patch
---

Components follow the reading direction in right-to-left languages such as Arabic.

- Likert scale labels that turn on their side sit under their own values instead of the opposite end's, and the scale chooses its label layout from the real width of the track.
- `ResizableFlexPanel` measures a drag from the edge the panel sits against, and the arrow key that points towards the end of the row widens it.
- `RichSelectGroup` moves to the next option on the arrow key that points towards it.
- The data table's range filter fills the bar between its two thumbs.
- `SplitButton` squares the corners where its two segments meet, link underlines grow from where the label starts, and rich text placeholders and scale end labels align to the start of the line.
- `SegmentedCodeField` keeps a code in left-to-right order on a right-to-left page, so its first character is in the leftmost box.
