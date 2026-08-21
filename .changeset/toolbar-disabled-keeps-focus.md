---
'@codaco/fresco-ui': patch
---

`SegmentedToolbar` items can now opt into remaining focused when they become unavailable. The default remains native disabled-button behavior.

The opt-in is available as `focusableWhenDisabled` on button, toggle, group-option, menu, and popover items. These items report `aria-disabled="true"`; other unavailable items continue to use the native `disabled` attribute. All unavailable items now dim and suppress hover and active styling.
