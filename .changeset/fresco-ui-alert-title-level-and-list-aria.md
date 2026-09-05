---
'@codaco/fresco-ui': patch
---

Fix two accessibility defects found by running the a11y checks over every story.

`AlertTitle` was always a level-four heading. An alert raised beside a page or section title therefore skipped a level, which is a `heading-order` failure and, for anyone navigating by headings, reads as a subsection that is not there. It now takes an optional `headingLevel`, still defaulting to `h4`, and keeps the same small all-caps treatment at every level.

`ArrayField` put `aria-readonly` and `aria-required` on the list holding its items. A list supports neither, and an attribute a role does not support is undefined behaviour for a screen reader rather than something it ignores. Neither is emitted now; each item's own controls carry that state, and `aria-disabled` still says when the whole field is unavailable.
