---
'@codaco/architect': patch
---

Rotate the shared Mapbox testing token embedded in the Transnational Networks template. The new token is URL-restricted to networkcanvas.com, networkcanvas.dev and localhost; it will not render maps on other domains or in Fresco, so researchers must add their own Mapbox token before fielding a study. Architect now shows an error banner when a protocol still carries the retired testing token, which was revoked on 2 September 2026, so researchers know to replace it.
