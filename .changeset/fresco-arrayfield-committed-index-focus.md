---
'@codaco/fresco-ui': patch
---

ArrayField now exposes each item's committed index (its position in the last committed value) to item renderers alongside the live preview index, so adapters that bind index-based field paths to a form store can keep those paths attached to the right item while a pointer reorder is only previewed. Keyboard reordering also retains focus on the drag handle after a move commits, so repeated arrow-key presses keep working instead of dropping focus to the document body. The "add item" button is now a primary button so it reads consistently across every list editor.

InputField's number variant no longer lets its +/- steppers shrink, and its middle padding scales down at `size="sm"`, so a narrow number field (e.g. a compact threshold input) keeps its value visible instead of collapsing to zero width.

The Field system (`Field`, `UnconnectedField`, and the underlying `BaseField`) gains an opt-in `labelHidden` prop that visually hides a field's label while keeping it as the control's accessible name — for use when a surrounding heading already names the field, so the redundant visible label is dropped without stripping the screen-reader name.
