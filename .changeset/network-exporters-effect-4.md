---
'@codaco/network-exporters': patch
---

Support Effect 4.0.0. Effect 4.0.0 reversed the order of the tuple `Effect.partition` returns, so with it installed, export runs reported every formatted session as an error and every failed session as a result. The `effect` peer dependency is now `^4.0.0`.
