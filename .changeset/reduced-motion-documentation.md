---
'@codaco/documentation': patch
---

The documentation site now honours the operating-system "reduce motion"
setting.

The animation library the site uses ignores that setting unless it is told to
honour it, and the site never told it to, so until now headings, paragraphs and
sidebar items animated into place for every reader, including those who had
asked their device for less movement. Those elements now arrive already in
position for those readers, with only gentle fades retained.
