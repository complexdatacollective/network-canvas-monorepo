---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
---

Add the **Network Composer** stage type — a free-form, single-screen, promptless
canvas for building a whole personal network in one place (create nodes, draw
multiple edge types, capture node and edge attributes, reposition, and delete,
with undo/redo and lasso/clique gestures).

- `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
  (no version bump, no migration) with cross-reference validation of its
  `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
  `superRefine` checks (at least one edge type; no duplicate edge subject types).
- `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the
  Sociogram canvas, edge layer, and force simulation.
