---
'@codaco/interview': patch
---

Contain Geospatial map initialisation failures instead of crashing the whole
stage. `mapbox-gl`'s `Map` constructor throws synchronously when the
environment can't host a map (most commonly "Failed to initialize WebGL" on
devices or browsers without working WebGL). That throw previously escaped the
effect and was caught by `StageErrorBoundary`, taking down the entire stage
with an opaque reconciler stack. The map creation is now wrapped in a
`try/catch` that captures the real error and renders a contained fallback
message, so participants can continue. `StageErrorBoundary`'s copyable debug
info also now leads with the error name and message — Firefox's `Error.stack`
omits the message, which was silently dropping the most useful detail from
bug reports.
