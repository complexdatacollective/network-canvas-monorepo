---
'@codaco/fresco-ui': patch
---

`EnclosingHeadingLevel` is now a public export at
`@codaco/fresco-ui/typography/EnclosingHeadingLevel`, alongside the
`useEnclosingHeadingLevel` hook and the `headingTagBelow` helper.

A heading level is only correct relative to the heading above it, so `Dialog`,
`Section` and `AlertTitle` state what they enclose and count down from what
encloses them. Everything that writes a heading has to take part in that, and
components outside this package write headings too: an editor with a title of
its own raises alerts and mounts sections beneath it, and a host mounts a form
under its own page heading. Until now they had no way to say so, so an alert
inside such an editor counted from the dialog above the editor and landed
beside the editor's own title instead of under it. There is no behaviour change
for anything already in the package.
