---
'@codaco/fresco-ui': minor
---

Add the application-shell layout and navigation primitives: `layout/AppFrame`,
`layout/AppArea`, `navigation/NavList`, `navigation/NavItem` and
`navigation/NavDrawer`.

`AppFrame` is the outer chrome — the skip link, the `header` it renders around
the host's header contents, an optional leading rail, and the region an area
fills. It renders no `nav` and no `main` of its own. `AppArea` renders those:
one labelled navigation region and one `main` the skip link lands on, becoming
a trigger and a drawer when its container is narrow. Keeping the two apart is
what lets one area's navigation replace another's rather than nest inside it.

`NavList` groups destinations under translatable headings, as sibling lists so
each reports its own count and none claims a hierarchy that isn't there.
`NavItem` takes its link from a render prop, so any router can supply one, and
folds an optional count into the destination's accessible name rather than
leaving a bare number beside it.

`NavDrawer` traps focus while open and hands focus to the destination when a
navigation closes it, falling back to the trigger when the destination has no
landing point. A navigation that is cancelled leaves it open.

`navigation/RouteFocus` gains `hasRouteFocusTarget`, which answers whether the
current route has a landing point — for callers that must know a handoff is
possible before giving up the focus they hold.
