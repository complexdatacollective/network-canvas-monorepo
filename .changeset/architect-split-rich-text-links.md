---
'@codaco/architect': patch
---

Fix a link that spans bold, italic, and plain text being saved as several
separate links. Adding one link across mixed formatting used to write out one
link per run of formatting, so a single citation became three links to the same
place — three things to hover, three underlines, and three links announced by a
screen reader. Such a link is now saved as one link, and the affected references
in the Life Transitions template have been repaired.
