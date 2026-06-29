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
  default. An optional `convexHulls` array names categorical node variables whose
  values are drawn as convex-hull groups.
- `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the shared
  canvas, edge layer, and force-directed auto-layout engine. Nodes are added by
  name from a field in the tool palette and laid out on a grid; in edge mode the
  first node tapped enters a linking state and the edge tool adopts that edge
  type's colour. Selecting a node or edge opens a resizable, backdrop-less
  right-hand drawer that leaves the canvas interactive; it edits the entity's
  attribute form (saving valid edits automatically, with no Save button) or shows
  an empty state when there is nothing to edit. A Groups tool draws convex hulls
  for a configured categorical variable (reusing the Narrative hull layer): pick a
  variable/value in its popover and tap nodes to toggle membership, or "add all"
  to a group from a lasso selection. Automatic layout is an interview-time
  toggle whose live value is persisted in stage metadata, so the participant's
  choice sticks across navigation; Architect only sets its default.
- `@codaco/shared-consts`: a `NetworkComposer` stage-metadata shape storing the
  participant's automatic-layout choice.
- `@codaco/fresco-ui`: the `SegmentedToolbar` gains a `menu` segment (a button
  that opens a single-select menu) and a `popover` segment (a pressed-able button
  that anchors arbitrary popover content), and a vertical toolbar now opens its
  tooltips, menus, and popovers to the right (into the canvas); `Popover` accepts
  a `side` prop.
- `@codaco/interview`: the NetworkComposer tool palette is built from the shared
  `SegmentedToolbar` — a Select tool, an Add-node button whose popover holds the
  name field, an edge tool that opens a menu of edge types, an automatic-layout
  toggle, and undo/redo.
