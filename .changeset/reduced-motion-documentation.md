---
'@codaco/documentation': patch
---

The documentation site now honours the operating-system "reduce motion"
setting.

Motion is off by default in the animation library the site uses, so until now
headings, paragraphs and sidebar items animated into place for every reader,
including those who had asked their device for less movement. Those elements
now arrive already in position for those readers, with only gentle fades
retained.
