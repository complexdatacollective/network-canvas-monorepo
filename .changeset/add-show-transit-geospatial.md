---
"@codaco/protocol-validation": patch
"architect-vite": patch
---

Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:
- showTransit: When enabled, Fresco displays transit layers on the map
- allowSearch: When enabled, participants can search the map for locations

Both options default to false (disabled).
