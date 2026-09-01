---
'@codaco/fresco-ui': minor
---

Add `navigation/RouteFocus`: route-change focus management and screen-reader
announcement, router-agnostic so any host can use it.

On a route change it moves focus to the new route's `h1` — marked with the
exported `routeFocusTargetProps` — and announces the destination politely.
Focus only moves when the navigation actually lost focus, so it will not fight a
dialog returning focus to its opener, an autofocused field, or a focus trap; and
it refuses a target inside an `inert` subtree, where focusing silently fails and
would strand focus on `body`.

The announcement alternates between two live regions, so a route whose title
matches the one just announced still changes a region and is still read out —
two stages called "Name people" are announced twice, not once. A route with no
heading to name it by announces nothing and clears what the last route left, and
a heading that only appears after the location commits — a lazy or
Suspense-backed route showing a fallback — is picked up when it arrives, without
taking focus from anyone who started using the fallback.

The host supplies its own router's location as a prop. `focusRouteTarget` is
exported for the case where a route's content is replaced without the location
changing, and both it and the component accept an optional `ownerDocument` for
UI rendered into a popped-out window or an iframe.
