---
'@codaco/fresco-ui': minor
---

Add `SegmentedToolbar`: a config-driven, accessible (`Surface`-backed) toolbar of button / toggle / exclusive-group / separator segments, built on the shared `Button` component. Each segment supports an icon, text, or both, and an optional `className` (e.g. for named theme colours like `bg-tomato text-white`). A button segment can also be hosted inside a caller-supplied element (`render`) — e.g. a Popover or Menu trigger — so its overlay wiring composes with the toolbar button and its roving focus. The toolbar offers enter/exit animation, horizontal or vertical orientation, and an optional draggable handle (with keyboard repositioning).
