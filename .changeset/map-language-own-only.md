---
'@codaco/interview': patch
'@codaco/architect': patch
'fresco': patch
'@codaco/interviewer': patch
---

The Geospatial stage now picks the map's label language and place search's
language with Network Canvas's own locale negotiation: Mapbox's languages are
matched against the participant's interview language, then their browser's
languages. Only a fit in one of the participant's own languages counts, so a
participant reading Afrikaans never sees the map labelled in Dutch (or
Belarusian in Russian) unless they also listed that language. With no fit,
the map shows each place's local name, and search uses English.
