---
'@codaco/fresco-ui': patch
---

The rich text editor no longer drops characters when you type quickly, and gains an opt-in `compact` prop for a tighter toolbar and content area.

The native `SelectField` now shows a placeholder option when the value matches no option, so picking the first option fires a change event. The styled `SelectField` dropdown matches its anchor width and no longer wraps long labels.

The `DataTable` sort arrow stays visible on the active column header, and `ArrayFieldDragHandle` accepts an optional `size` prop.
