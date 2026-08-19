---
'@codaco/fresco-ui': minor
'@codaco/architect': patch
---

Two different questions about keyboard focus now have one answer each.

"Is anything holding focus right now?" and "may I send focus back to this
element when a dialog closes?" look like the same question and are not. A
focus-return target has to be an `HTMLElement`, because that is what the
underlying dialog accepts — but plenty of things that can hold focus are not
one: a link, or anything carrying `tabindex`, inside an inline `<svg>` focuses
as an `SVGElement`.

Four places had written their own version of the first question, and three of
them tested for the second. Each would therefore have reported a focused SVG
control as "nothing is focused" and moved focus off someone who was using it —
the modal layer by pulling focus back to whatever opened it, and Architect's
route-change handler by dragging it to the page heading. No interface in
Architect, Interviewer, Fresco or the interview focuses such a control today,
so nobody has hit this; it is a fault waiting for the first one, and the modal
layer is a published component that other people's interfaces render.

`@codaco/fresco-ui/utils/finalFocus` is now a public entry point. It exports
`holdsFocus` for the state question alongside the existing
`isUsableFinalFocusTarget` for the destination question, with the second
defined in terms of the first so the rules they share cannot drift apart. The
modal popup, the "jump to the first unanswered question" behaviour and
Architect's route-change focus all read it, and a test fails if a fifth
hand-written copy appears.
