---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Status messages, the navigation bar and the pedigree regions now use native
HTML elements (`<output>`, `<nav>` and `<section>`) in place of ARIA roles on
generic elements, so assistive technology reports them as before without
relying on the role. The stand-in location search, used when no map key is
set, now links its search box to its suggestion list. Audio items no longer
carry an empty captions track.
