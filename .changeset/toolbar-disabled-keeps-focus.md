---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A toolbar segment that becomes unavailable can now retain keyboard focus when that behaviour is explicitly requested. Undoing the last change — pressing Undo until there is nothing left to undo — used to drop focus back to the start of the page, because browsers move focus off a natively disabled control. `SegmentedToolbar` therefore exposes `focusableWhenDisabled` on button, toggle, group-option, menu and popover items. It defaults to `false`, preserving native disabled-button semantics; Architect's history controls and the Network Composer's Undo/Redo controls opt in because those commands can become unavailable while they hold focus.

Unavailable segments now also look unavailable. They dim, take a not-allowed cursor, and no longer light up under the pointer. An item that opts into disabled focusability reports `aria-disabled="true"`; all other items receive the native `disabled` attribute and leave keyboard focus as usual.

For library consumers: `@codaco/tailwind-config` adds two variants, `ui-disabled` and `ui-enabled`, which match `aria-disabled="true"` as well as the native `:disabled` state. `Button` now gates every availability-dependent style on them, so a control that must stay focusable while unavailable still looks and behaves unavailable. Anything overriding one of Button's hover or active styles must use the same variants — `ui-enabled:hover:…` rather than `hover:enabled:…` — or the override will no longer merge with the style it is meant to replace.
