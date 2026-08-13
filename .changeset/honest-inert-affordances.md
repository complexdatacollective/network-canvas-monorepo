---
'@codaco/fresco-ui': patch
'@codaco/architect': patch
---

Fixes interactions that were advertised to assistive technology but did nothing when activated.

`ArrayField` now omits `onDelete`/`onEdit`/`onChange`/`onUpdate` (and the editor's `onSave`) entirely while disabled or read-only, instead of substituting no-op stand-ins. An `itemComponent`/`editorComponent` that renders its edit/delete/save affordance from handler presence — the normal pattern — now correctly hides that affordance rather than drawing a live-looking control wired to nothing.

`SegmentedToolbar`'s toggle and group segments now forward `onPressedChange`/`onValueChange` straight through to Base UI, the same way button segments already forward `onClick`. This also fixes those callbacks silently losing Base UI's `eventDetails` argument, which a consumer needs to veto a change via `eventDetails.cancel()`.

Architect's library panel gallery promo card no longer announces itself as a selectable option — clicking or activating it never did anything, since the collection it sits in doesn't support selection. It's now presented as a labelled group containing its own Dismiss button and gallery link, both still independently operable.
