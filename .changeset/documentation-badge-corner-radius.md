---
'@codaco/documentation': patch
---

Fix the corner radius on the copy-code confirmation bubble and the interface-summary badges (Schema, Available In, Requires). They used `rounded-md`, a step the shared theme's radius scale does not define (it goes straight from the default radius to `rounded-lg`), so the plugin serving the scale silently applied no rounding at those corners. They now use `rounded-lg`, matching their pre-theme-migration radius.
