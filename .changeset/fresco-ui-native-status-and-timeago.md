---
'@codaco/fresco-ui': patch
---

`TimeAgo` is now a real button rather than a `<span>` with a button role, so
it shows the shared focus ring and needs no hand-written keyboard handling.
Its `onClick` now also runs when the time is activated with Enter or Space,
as a button's click does, and is typed for any HTML element. Status messages
in `RouteFocus`, `EverythingBar`, `LocaleSwitcher` and the dialog footer are
`<output>` elements with `aria-live="polite"`, so assistive technology
announces them as before. `RichTextEditor`'s `aria-describedby` prop is now
optional, as it already was in practice.
