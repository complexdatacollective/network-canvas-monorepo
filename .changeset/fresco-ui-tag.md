---
'@codaco/fresco-ui': minor
---

Add `Tag`, a compact uppercase label with an optional palette-coloured dot that becomes an `aria-pressed` toggle button when given `onPressedChange` — the shape used for multi-select facet filters. Architect's New Stage capability filter now uses it.

`GridLayout` accepts `maxColumns`, so a collection can cap its column count while wider containers grow the items instead. Internally, `Badge` and `Tag` now read the named palette from one shared map.
