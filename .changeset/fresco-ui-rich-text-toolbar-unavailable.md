---
'@codaco/fresco-ui': patch
---

Make the rich text toolbar unavailable when its field is.

A read-only or disabled editor left its toolbar looking and reading as though it still worked. The link control was the worst of it: it is a disclosure, which works out its own availability rather than taking the field's, so it reported `aria-disabled="false"` and sat undimmed beside its unavailable siblings, ready to open its popover over a document nobody could edit. The rest were marked `aria-disabled` but never actually disabled, so they stayed in the tab order of a toolbar with nothing to offer.

Every button is now disabled and marked `aria-disabled` while the field is, and the content stays readable. A button unavailable only because of where the caret is — Undo with nothing to undo — is unchanged: it stays focusable and marked `aria-disabled`, which is what the ARIA toolbar pattern asks for.

A link popover already open when the field becomes unavailable is closed with it. Disabling the trigger said nothing about the panel it had opened: the URL box and the Apply and Remove buttons live in a portal of their own, and they went on running editor commands against a read-only field and reporting the result back as a change a researcher had made.
