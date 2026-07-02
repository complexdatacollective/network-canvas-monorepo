---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/protocol-utilities': patch
'@codaco/shared-consts': patch
'@codaco/fresco-ui': minor
---

Add the **Network Composer** stage type — a free-form, single-screen, promptless
canvas for building a whole personal network in one place (create nodes, draw
multiple edge types, capture node and edge attributes, group nodes into convex
hulls, reposition, and delete, with undo/redo and lasso selection).

- `@codaco/protocol-validation`: a new additive schema-8 `NetworkComposer` stage
  (no version bump, no migration) with cross-reference validation of its
  `quickAdd` / `layoutVariable` / `nodeForm` / per-edge-type form references, and
  a `superRefine` check rejecting duplicate edge subject types (edge types and
  node attributes are both optional). Automatic layout uses the shared flat
  `behaviours.automaticLayout` boolean (as the Sociogram and Narrative do); for
  NetworkComposer it is only the starting default. An optional
  `convexHullVariable` names a single categorical node variable whose values are
  drawn as convex-hull groups.
- `@codaco/interview`: the `NetworkComposer` runtime interface, reusing the shared
  canvas, edge layer, and force-directed auto-layout engine. Nodes are added by
  name from a field in the tool palette and laid out on a grid; in edge mode the
  first node tapped enters a linking state and the edge tool adopts that edge
  type's colour. Selecting a node or edge opens a resizable, backdrop-less
  right-hand drawer that leaves the canvas interactive; it edits the entity's
  attribute form (saving valid edits automatically, with no Save button) or shows
  an empty state when there is nothing to edit. When a `convexHullVariable` is
  configured its hulls are always drawn (reusing the Narrative hull layer), and
  group membership feeds the layout's group-cohesion force so same-group nodes
  cluster under automatic layout. Nodes are grouped with the Groups tool (pick a
  group in its popover, tap nodes to toggle membership) or by lasso-selecting in
  select mode and choosing which group to add the selection to. Automatic layout
  is an interview-time toggle whose live value is persisted in stage metadata, so
  the participant's choice sticks across navigation; Architect only sets its
  default.
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
