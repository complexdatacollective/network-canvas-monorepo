---
'@codaco/fresco-ui': minor
---

Shared form and interaction components now provide more reliable validation, focus, accessibility, and responsive layout behavior.

- Required fields, errors, hints, and custom controls expose only the ARIA relationships they actually render, and a blocked submission focuses the first usable invalid control.
- Optional blank values no longer trigger format, range, or length errors. External value changes clear stale errors and remain synchronized with rich text fields.
- Dialogs keep the rest of the page inert, restore focus when closed, and expose scrollable content only when it can actually scroll.
- Toolbars retain keyboard focus when an action becomes unavailable, and buttons, repeated fields, selected-resource cards, and segmented controls can shrink within narrow containers.
- `Node` can render as presentational content inside another control, and `IconButton` accepts `aria-labelledby` as an accessible name.

`ArrayField` no longer imposes a minimum width. It fills and shrinks with its container, so hosts that relied on it to hold a column open must set that width themselves.
