---
'@codaco/fresco-ui': patch
---

Fix two heading-order defects found by running the a11y checks over every story.

Both are the same defect: a heading level is only correct relative to the heading above it, and a component that can be rendered anywhere cannot know what that is. A `Dialog` now states the level it encloses, and what is inside counts down from it.

`AlertTitle` was always a level-four heading, so an alert raised in a dialog sat as an `h4` under the dialog's `h2` title — a `heading-order` failure, and for anyone navigating by headings a title that reads as belonging to a subsection that is not there. An alert title in a dialog is now an `h3` without being asked; anywhere else it is still an `h4`. A `headingLevel` prop names a level explicitly for the rare outline neither of those describes.

`Section` took its heading level from Surface depth, and `Dialog` restarts the Surface ladder one level in so that surfaces inside an overlay derive from the overlay rather than from wherever it was opened. A first-level section in a dialog was therefore an `h4` under the `h2` as well, on every dialog whose content is built from sections. Sections inside a dialog now count down from the dialog's own title, so the first is an `h3`.

The element changes and nothing else does: a section keeps the type treatment its Surface depth gives it, an alert title keeps the small all-caps treatment that makes it read as one, and neither is touched outside a dialog.
