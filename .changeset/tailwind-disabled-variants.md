---
'@codaco/tailwind-config': minor
---

The new `ui-disabled` and `ui-enabled` variants match both native and ARIA-disabled controls. `Button` uses these variants for availability-dependent styles, so overrides should use forms such as `ui-enabled:hover:…` instead of `hover:enabled:…`.
