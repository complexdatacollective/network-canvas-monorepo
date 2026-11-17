---
'@codaco/fresco-ui': minor
'@codaco/interviewer': patch
'fresco': patch
---

Screen readers now name every table filter field. In Interviewer, the filter panel on the Data page and each of its fields (Case ID, Protocol, Started, Updated and Export status) are named by the heading shown above them. In Fresco, every field in a column's filter is named by that column's title; an interview network condition's comparison and number are named "Comparison" and "Value". Fresco UI's table filters take `aria-labelledby` for this, and a faceted toolbar filter with no label is named by its title.
