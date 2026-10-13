---
'@codaco/protocol-validation': minor
'@codaco/interview': minor
'@codaco/architect': minor
'@codaco/interviewer': minor
'fresco': minor
---

Ordinal and categorical bin stages can now be answered by tapping instead of
dragging, which suits touch screens, switch access and participants who find
dragging hard.

**Protocols (`@codaco/protocol-validation`)**

- Schema 9 bin stages accept `behaviours.interactionMode`, either `drag` (the
  default when it is left out) or `select`. Bin stages migrated from schema 8
  have no `behaviours`, so they keep drag and drop.

**Interview runtime (`@codaco/interview`)**

- In `select` mode the stage shows one person at a time above the drawer,
  and the participant taps the bin they go in. The next unplaced person then
  appears, until everyone has been placed. Tapping a person who is already in
  a bin makes them the one being placed, so an answer can
  be changed. Nothing can be dragged in this mode.
- Screen readers announce who is being placed, and each bin is a button
  named after the person and the bin.
- `node_binned` and `node_rebinned` analytics events carry the
  `interaction_mode`, and a `focal_node` event records each person shown.
  An ordinal bin now records `node_rebinned` when a person moves between
  bins.

**Architect**

- Ordinal and categorical bin stages have a new **Placing nodes** section for
  choosing between drag and drop and tap to place.
