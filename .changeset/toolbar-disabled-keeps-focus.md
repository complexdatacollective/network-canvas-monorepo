---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': patch
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

`SegmentedToolbar` items can now opt into remaining focused when they become unavailable. Architect's history controls and the Network Composer's Undo and Redo controls use this behavior so reaching the end of the history no longer drops keyboard focus to the start of the page. The default remains native disabled-button behavior.

The opt-in is available as `focusableWhenDisabled` on button, toggle, group-option, menu, and popover items. These items report `aria-disabled="true"`; other unavailable items continue to use the native `disabled` attribute. All unavailable items now dim and suppress hover and active styling.

For consumers of `@codaco/tailwind-config`, the new `ui-disabled` and `ui-enabled` variants match both native and ARIA-disabled controls. `Button` uses these variants for availability-dependent styles, so overrides should use forms such as `ui-enabled:hover:…` instead of `hover:enabled:…`.
