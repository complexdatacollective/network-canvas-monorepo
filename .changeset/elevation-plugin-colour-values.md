---
'@codaco/tailwind-config': patch
---

The elevation and inset-surface plugins no longer copy non-colour values into `--scoped-text`, `--scoped-bg` or `--inset-bg`. Font sizes such as `text-[12px]`, background sizes such as `bg-[length:200%_100%]`, gradients and `url()` images used to land in those variables, where elevation shadows, Badge text and inset shadows read them as colours. Colour classes, including `var()` values such as `bg-(--edge-color)`, behave as before.
