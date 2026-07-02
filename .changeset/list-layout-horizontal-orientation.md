---
'@codaco/fresco-ui': minor
---

`ListLayout` now accepts an `orientation` option. `'horizontal'` lays items out
in a single row and navigates with Left/Right (via a new `RowKeyboardDelegate`);
`'vertical'` (the default) is unchanged. Intended for short, non-virtualized
collections such as a horizontal timeline/filmstrip.
