---
'@codaco/fresco-ui': minor
---

`ListLayout` now accepts an `orientation` option. `'horizontal'` lays items out
in a single row and navigates with Left/Right (via a new `RowKeyboardDelegate`);
`'vertical'` (the default) is unchanged. Intended for short, non-virtualized
collections such as a horizontal timeline/filmstrip.

`Collection`'s `filterFuseOptions` now accepts `includeScore`. Setting it to
`false` keeps filtered results in their original collection order instead of
re-sorting them by match relevance.

`Collection` gains two animation props: `staggerOnMount` (default `true`) to opt
out of the imperative entrance stagger when the caller animates item entrance
itself, and `animateItemLayout` (default `true`) to keep `AnimatePresence`
enter/exit while letting items snap to new positions (avoids layout animation
being triggered by scrolling inside a scroll container).
