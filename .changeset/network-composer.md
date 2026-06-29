---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/protocol-utilities': patch
'@codaco/shared-consts': patch
---

Add the **Network Composer** stage type — a free-form, single-screen, promptless
canvas for building a whole personal network in one place (create nodes, draw
multiple edge types, capture node and edge attributes, reposition, and delete,
with undo/redo and lasso/clique gestures).

- `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
  (no version bump, no migration) with cross-reference validation of its
  `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
  `superRefine` checks (at least one edge type; no duplicate edge subject types).
  Automatic layout is configured as `behaviours.automaticLayout.defaultEnabled`:
  unlike the Sociogram's fixed `enabled` mode, this is only the starting default.
- `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the
  Sociogram canvas, edge layer, and force simulation. Automatic layout is an
  interview-time toggle (a switch in the tool palette) whose live value is
  persisted in stage metadata, so the participant's choice sticks across
  navigation; Architect only sets its default.
- `@codaco/shared-consts`: a `NetworkComposer` stage-metadata shape storing the
  participant's automatic-layout choice.
