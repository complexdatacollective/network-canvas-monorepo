---
'@codaco/fresco-ui': patch
---

Screen readers can now read a `DropdownMenu` or `Popover` opened inside a
`Dialog` or `Modal`. Popups used to portal into the shared `PortalContainer`,
beside the dialog. A popup that stays mounted while closed, as these two do by
default, was then hidden from assistive technology with `aria-hidden` when the
dialog opened, so it could be seen and clicked but not read. Everything
rendered inside a `Modal` (menus, selects, comboboxes, popovers, tooltips and
dialogs declared inside it) now portals into the modal's own portal node,
which the open dialog never hides. Focus trapping is unchanged, and Escape
still closes an open popup before the dialog behind it.

`@codaco/fresco-ui/PortalContainer` also exports `PortalContainerScope`, which
points `usePortalContainer` at an existing element for a subtree, so a custom
overlay can nest its popups the same way.
