---
'@codaco/fresco-ui': minor
---

Form options can explain why they are unavailable, form errors survive
re-renders, and long node labels break more readably.

- `BooleanField` and `RadioGroupField` options take a `description`, read as
  that option's accessible description (for example, why it is unavailable).
  `BooleanField` options can be disabled one at a time. A `BooleanField` keeps
  a keyboard tab stop when its chosen answer becomes unavailable.
- `useField` compares `initialValue` by content, so a field given a fresh but
  equal array or object on every render no longer re-registers and keeps its
  validation error after a failed submit.
- `Node` labels ignore soft hyphens on the rungs above the label fit floor, and
  at the floor break long words at syllable points with at least three letters
  either side, instead of stranding a single letter. The label's text and
  accessible name are unchanged.
