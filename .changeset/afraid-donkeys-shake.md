---
'@codaco/fresco-ui': minor
---

Add `navigation/RouteFocus`: route-change focus management and screen-reader
announcement, router-agnostic so any host can use it.

On a route change it moves focus to the new route's `h1` — marked with the
exported `routeFocusTargetProps` — and announces the destination through a
polite live region. Focus only moves when the navigation actually lost focus, so
it will not fight a dialog returning focus to its opener, an autofocused field,
or a focus trap; and it refuses a target inside an `inert` subtree, where
focusing silently fails and would strand focus on `body`.

The host supplies its own router's location as a prop. `focusRouteTarget` is
exported for the case where a route's content is replaced without the location
changing, and both it and the component accept an optional `ownerDocument` for
UI rendered into a popped-out window or an iframe.
