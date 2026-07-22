---
'@codaco/documentation': patch
---

Corrected two claims on the Data Export page:

- The R import example now uses the egor package (the CRAN package is `egor`, not "egoR") and its `threefiles_to_egor()` function with the Network Canvas identifier columns, replacing an example that called a function signature that doesn't exist. The tutorial page's package link label was fixed to match.
- The "Merge sessions by protocol" export option now states its availability explicitly: it is only offered by Interviewer Classic up to version 6.5 (removed in 6.6), while Interviewer and Fresco always export each session as separate files. The section also now correctly describes merged GraphML output as a single file with one `<graph>` element per session.
