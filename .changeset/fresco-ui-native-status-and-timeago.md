---
'@codaco/fresco-ui': patch
---

`TimeAgo` is now a real button rather than a `<span>` with a button role, so
it shows the shared focus ring and needs no hand-written keyboard handling.
Its `onClick` receives a button event. Status messages in `RouteFocus`,
`EverythingBar`, `LocaleSwitcher`, `CollectionFilterInput` and the dialog
footer are `<output>` elements with `aria-live="polite"`, so assistive
technology announces them as before. `RichTextEditor`'s `aria-describedby`
prop is now optional, as it already was in practice.
