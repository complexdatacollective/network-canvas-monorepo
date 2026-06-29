---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/protocol-utilities': patch
'@codaco/shared-consts': patch
'@codaco/fresco-ui': minor
---

Add the **Network Composer** stage type — a free-form, single-screen, promptless
canvas for building a whole personal network in one place (create nodes, draw
multiple edge types, capture node and edge attributes, reposition, and delete,
with undo/redo and lasso/clique gestures).

- `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
  (no version bump, no migration) with cross-reference validation of its
  `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
  `superRefine` checks (at least one edge type; no duplicate edge subject types).
  Automatic layout uses the shared flat `behaviours.automaticLayout` boolean (as
  the Sociogram and Narrative do); for NetworkComposer it is only the starting
  default.
- `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the shared
  canvas, edge layer, and force-directed auto-layout engine. Automatic layout is
  an interview-time toggle whose live value is persisted in stage metadata, so the
  participant's choice sticks across navigation; Architect only sets its default.
- `@codaco/shared-consts`: a `NetworkComposer` stage-metadata shape storing the
  participant's automatic-layout choice.
- `@codaco/fresco-ui`: the `SegmentedToolbar` gains an optional `label` segment
  for grouping segments under a small section heading.
- `@codaco/interview`: the NetworkComposer tool palette is built from the shared
  `SegmentedToolbar` (an exclusive tool group, history buttons, and the
  auto-layout toggle), with section labels.
