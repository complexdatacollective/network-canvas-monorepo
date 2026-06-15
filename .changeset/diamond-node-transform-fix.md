---
'@codaco/fresco-ui': patch
---

Fix diamond-shaped nodes rendering with an offset visual center. The diamond's `rotate`/`scale` was applied to the Node's root element, where it composed with inline `transform` positioning (sociogram centering) and motion layout projection — shifting edge endpoints away from the node center, making dragged nodes jump under the cursor, and breaking layout animations (OneToManyDyadCensus, NodeDrawer). The shape transform now lives on an inner background layer, keeping the root element transform-free.
