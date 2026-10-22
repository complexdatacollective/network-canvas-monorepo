---
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

On a Geospatial stage, the map's labels and the place search now follow the language the participant is reading the interview in, instead of always searching in English. A participant reading a Hungarian protocol sees Hungarian place names on the map and gets Hungarian search results. Changing the interview language updates the map in place, without reloading it, and replaces any search results already on screen.

Where Mapbox has no labels in the language, the map shows each place's own name. Where place search has no results in the language (it has no Chinese, Korean or Arabic), the search uses the interview's interface language if it can, and English otherwise. The map's button labels keep following the interface language.
