---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A date field now shows the keyboard focus ring in Safari. It showed none
there, whether or not the date had an error, so someone moving through a form
with the keyboard could not see when they had reached a date question. Other
browsers already showed the ring.
