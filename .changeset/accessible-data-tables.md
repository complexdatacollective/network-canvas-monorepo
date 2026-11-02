---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Data tables are easier to use with a screen reader or the keyboard. Every table now has a name that is read out when you reach it, column headers say which column is sorted and in which direction, and the number of selected rows and the current page ("Page 2 of 5") are announced as they change. A table that is wider than its space can be scrolled with the keyboard. In `@codaco/fresco-ui`, `DataTable` now requires an `aria-label` or `aria-labelledby`.
