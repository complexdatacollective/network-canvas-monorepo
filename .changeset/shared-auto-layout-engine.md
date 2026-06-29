---
'@codaco/interview': minor
---

Unified Sociogram and Narrative onto a shared force-directed auto-layout engine.
The engine measures each node to derive collision spacing (guaranteeing no node
overlap), adds edge attraction, group cohesion that pulls same-group nodes into
their convex hulls, and centering. Narrative additionally gains group-aware
layout and is now fully read-only during the settled interaction.
