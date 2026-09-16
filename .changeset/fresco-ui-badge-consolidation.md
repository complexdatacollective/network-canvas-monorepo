---
'@codaco/fresco-ui': major
'@codaco/architect': patch
'fresco': patch
'@codaco/interviewer': patch
'@codaco/background-creator': patch
---

`Badge` is now the one label chip, replacing three overlapping components that
rendered the same kind of object differently depending on which one a call site
happened to pick.

`Badge` gains semantic `tone`s (`neutral`, `primary`, `secondary`, `accent`,
`info`, `success`, `warning`, `destructive`), each painted in a `filled` or
`soft` `appearance` from the theme's colour pairs so it follows light and dark
mode; three sizes (`sm`, `md`, `lg`) that share one box with a pinned
line-height; `mono` and `uppercase` typography options; a leading `icon` slot;
the palette `color` prop for taxonomic colouring; and a Base UI `render`
override for rendering as a button, toggle or animated element. It renders a
`span` rather than a `div`.

`Tag` keeps its name and API but is now a `Badge` with a toggle state and
palette dot, so the two can no longer drift. Its `size` scale is Badge's.

**Breaking:** `Pill` and the `@codaco/fresco-ui/Pill` subpath are removed —
use `Badge` with `mono` (and `appearance="soft"` for the outlined look).
`Badge`'s `variant` prop is replaced by `tone` and `appearance`:
`variant="default"` → `tone="primary"`, `variant="outline"` →
`appearance="soft"`, `variant="destructive"` → `tone="destructive"`.

Architect's codebook usage chips, library counts, asset cards and the
requires-internet label on protocol cards; Interviewer's deck card label;
Background Creator's zone pills; and Fresco's activity feed, interview,
participant and passkey chips all render through it.
