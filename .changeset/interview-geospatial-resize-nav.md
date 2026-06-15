---
'@codaco/interview': patch
---

Fix the navigation bar disappearing off-screen when the browser is resized
smaller while a Geospatial stage is open. The Mapbox canvas participates in
layout flow (the package doesn't ship Mapbox's stylesheet), so a stale,
oversized canvas was forcing the stage wider than the viewport. The map now
resizes with its container via a `ResizeObserver`, the map container clips its
overflow, and the stage flex item can shrink horizontally (`min-w-0`).
