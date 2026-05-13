---
"@codaco/fresco-ui": minor
---

New `<ThemedRegion>` component and `<PortalContainerProvider>` for declarative theme scoping. All Portal-using components (Modal, Popover, Tooltip, DropdownMenu, Toast, Select, Combobox) now thread a portal container through React context, allowing themed dialogs and popovers to inherit the theme of the closest themed ancestor instead of always portaling into `document.body`.

Outside a `<PortalContainerProvider>` the new container prop falls back to Base UI's default (`document.body`), so existing consumers see no behavior change.

The new exports are `@codaco/fresco-ui/ThemedRegion` (`ThemedRegion`) and `@codaco/fresco-ui/PortalContainer` (`PortalContainerProvider`, `usePortalContainer`).
