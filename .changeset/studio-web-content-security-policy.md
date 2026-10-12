---
'@codaco/studio-web': minor
---

The Studio page is now served with a content security policy whose
`connect-src` is `'self' https://api.mapbox.com`: the page and the participant
interview can open connections only to the instance itself and to Mapbox, which
a protocol's Geospatial stage and the editor's map preview load maps and place
search from. Any other origin, including Mapbox's own usage-events host, is
refused by the browser.
