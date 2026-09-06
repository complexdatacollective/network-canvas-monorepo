---
'@codaco/fresco-ui': patch
---

Fix three accessibility defects found by running the a11y checks over every story.

`AlertTitle` was always a level-four heading. An alert raised beside a page or section title therefore skipped a level, which is a `heading-order` failure and, for anyone navigating by headings, reads as a subsection that is not there. It now takes an optional `headingLevel`, still defaulting to `h4`, and keeps the same small all-caps treatment at every level.

`Section` took its heading level from Surface depth, and `Dialog` restarts the Surface ladder one level in so that surfaces inside an overlay derive from the overlay rather than from wherever it was opened. A first-level section in a dialog was therefore an `h4` under the dialog's `h2` title — the same `heading-order` failure, on every dialog whose content is built from sections. Sections inside a dialog now count down from the dialog's own title, so the first is an `h3`. The element changes and nothing else does: a section keeps the type treatment its Surface depth gives it, and a section outside a dialog is untouched.

`ArrayField` put `aria-readonly` and `aria-required` on the list holding its items. A list supports neither, and an attribute a role does not support is undefined behaviour for a screen reader rather than something it ignores. Neither is emitted now; each item's own controls carry that state, and `aria-disabled` still says when the whole field is unavailable.
