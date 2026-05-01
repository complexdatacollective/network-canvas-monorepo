---
'@codaco/tailwind-config': minor
'@codaco/fresco-ui': patch
---

Move the canonical Fresco themes (default + interview) into @codaco/tailwind-config.
The previous default-theme.css was a stripped subset; it's now replaced with the
full theme including light + dark variants and Inclusive Sans body font.
The new interview-theme.css adds the interview-mode palette (keyed off
:root:has([data-interview])).
