---
'@codaco/fresco-ui': major
'@codaco/architect': patch
'@codaco/background-creator': patch
'fresco': patch
'@codaco/interviewer': patch
---

Buttons that were drawn as a hollow outline are now filled, or plain text where
they sit beside another filled button, so secondary actions read more clearly.
In Background Creator the Delete button is now solid red. In
`@codaco/fresco-ui`, the `outline` variant of `Button`, `IconButton` and
`buttonVariants` is removed: use `default` for a secondary action, or `text`
beside a neutral filled button. `CollectionSortSelect` now defaults to the
`default` variant.
