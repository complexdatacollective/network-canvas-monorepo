---
'@codaco/tailwind-config': minor
---

Add a canonical, oklch-derived default dark theme (`[data-theme='dark']`) to the Fresco design system; the previous default dark variant was broken and unused, so apps opting into dark mode now get a working, on-brand dark theme. Does not affect apps that never set `data-theme='dark'` (architect is light-only; interviewer uses the interview theme).
