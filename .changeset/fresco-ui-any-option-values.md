---
'@codaco/fresco-ui': patch
---

Form fields and collection search work with option values and property names
that contain any characters.

- `CheckboxGroup`, `RadioGroup` and `RadioMatrixField` number their option and
  row element IDs by position, instead of building them from the option value
  or row ID. A value or row ID that contains a space no longer produces an
  invalid element ID, which broke the `aria-labelledby` link between a
  `RadioMatrixField` row and its heading.
- Collection search passes property paths to Fuse as arrays rather than joining
  them with `.`, so a property whose name contains a dot is searched as one key.
