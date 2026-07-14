---
'@codaco/architect': patch
---

Fix creating a new layout variable from a Narrative stage preset. The handler destructured a `dispatch` prop that react-redux's object-shorthand `mapDispatchToProps` never provides, so the action threw; it now calls the already-dispatch-bound action creator directly.
