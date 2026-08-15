---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

A toolbar segment that becomes unavailable no longer takes keyboard focus with it. Undoing your last change — pressing Undo until there is nothing left to undo — used to drop focus back to the very start of the page, because the segment was momentarily disabled outright and browsers move focus off a disabled control. `SegmentedToolbar` segments now stay focusable while unavailable and report it with `aria-disabled`, which is what the toolbar's roving focus already assumed, so focus stays put and a screen reader announces the segment as unavailable instead of going silent. This affects every toolbar built on `SegmentedToolbar`: Architect's project and stage-editor actions, and the Network Composer, Narrative and Narrative Pedigree toolbars during an interview.

Unavailable segments now also look unavailable. They dim, take a not-allowed cursor, and no longer light up under the pointer — while staying hoverable, so an icon-only segment can still show the tooltip that carries its only visible label. Toggle, group, menu and popover segments join button segments in all of this, and no longer contradict themselves by reporting `aria-disabled="false"` while disabled.

For library consumers: `@codaco/tailwind-config` adds two variants, `ui-disabled` and `ui-enabled`, which match `aria-disabled="true"` as well as the native `:disabled` state. `Button` now gates every availability-dependent style on them, so a control that must stay focusable while unavailable still looks and behaves unavailable. Anything overriding one of Button's hover or active styles must use the same variants — `ui-enabled:hover:…` rather than `hover:enabled:…` — or the override will no longer merge with the style it is meant to replace.
