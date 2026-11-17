---
'@codaco/fresco-ui': minor
'@codaco/interviewer': patch
---

Screen readers now name the filter panel on the Data page and every field in it — Case ID, Protocol, Started, Updated and Export status — by the heading shown above it. Fresco UI's faceted, date and yes/no table filters take `aria-labelledby` for this, and a faceted filter with no label is named by its title.
