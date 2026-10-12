---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Ordinal bin headings now have room for four lines of their smallest text.

A long option label that could not be hyphenated, such as a whole sentence on
a device whose browser has no hyphenation dictionary for the interview
language, previously needed a fourth line that the heading did not have, so
the end of the label was cut off. The heading is now sized to hold that
fourth line.
