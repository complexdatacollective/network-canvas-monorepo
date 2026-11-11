---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A field with an error now shows the keyboard focus ring like any other field.
Text inputs, text areas and native drop-downs with an error showed no ring at
all, so someone moving through a form with the keyboard could not see which
field they were in; styled drop-downs, comboboxes and the icon picker showed
the browser's own outline instead of the usual ring. The red error border
stays.
