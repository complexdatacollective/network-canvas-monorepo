---
'@codaco/fresco-ui': patch
---

Icon buttons state their square width explicitly instead of deriving it from
`aspect-ratio` and height, which shipped Safari computes as zero inside nested
flex rows — interview navigation, undo/redo pills, and rich-text toolbar
buttons rendered as nothing. The rich-text toolbar also drops a redundant
nested `group` role: each toggle set is now one element carrying both the
toolbar-group and toggle-group behaviours, and the link control sits at
toolbar level rather than inside the toggles' group.
